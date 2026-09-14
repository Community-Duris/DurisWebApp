import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
const WATCHDOG = path.join(PROJECT_ROOT, 'deploy/scripts/durisweb-watchdog');
const temporaryDirectories: string[] = [];

type Probe = 'local' | 'public' | 'ready';
type ProbeResult = 'ok' | 'degraded' | 'down';

interface WatchdogFixture {
  root: string;
  state: string;
  log: string;
  environment: NodeJS.ProcessEnv;
}

/** Creates isolated watchdog state plus systemctl/curl doubles driven by fixture files. */
function createWatchdogFixture(overrides: NodeJS.ProcessEnv = {}): WatchdogFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-watchdog-'));
  temporaryDirectories.push(root);
  const state = path.join(root, 'state');
  const binaries = path.join(root, 'bin');
  const log = path.join(root, 'commands.log');
  fs.mkdirSync(state);
  fs.mkdirSync(binaries);

  fs.writeFileSync(
    path.join(binaries, 'systemctl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\\n' "$*" >>"$WATCHDOG_TEST_LOG"
if [ "\${2:-}" = 'show' ]; then
  unit_state="$WATCHDOG_TEST_ROOT/unit-\${3:-missing}"
  if [ -f "$unit_state" ]; then cat "$unit_state"; else printf 'active\\n'; fi
fi
`,
    { mode: 0o700 },
  );
  fs.writeFileSync(
    path.join(binaries, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do url=$argument; done
printf 'curl %s\\n' "$url" >>"$WATCHDOG_TEST_LOG"
case "$url" in
  */ready) probe=ready ;;
  https://*) probe=public ;;
  *) probe=local ;;
esac
result=ok
if [ -f "$WATCHDOG_TEST_ROOT/probe-$probe" ]; then result=$(cat "$WATCHDOG_TEST_ROOT/probe-$probe"); fi
case "$result" in
  down) exit 7 ;;
  degraded) status=degraded database=error ;;
  *) status=ok database=ok ;;
esac
printf '{"status":"%s","service":"durisweb-backend","checks":{"database":"%s","cache":"ok"}}' \\
  "$status" "$database"
`,
    { mode: 0o700 },
  );

  return {
    root,
    state,
    log,
    environment: {
      PATH: `${binaries}:${process.env.PATH ?? ''}`,
      STATE_DIRECTORY: state,
      WATCHDOG_TEST_LOG: log,
      WATCHDOG_TEST_ROOT: root,
      WATCHDOG_SERVICE_SCOPE: 'user',
      WATCHDOG_APPLICATION_SERVICE: 'durisweb-production.service',
      WATCHDOG_CACHE_SERVICE: 'durisweb-redis.service',
      WATCHDOG_INGRESS_SERVICE: 'durisweb-cloudflared.service',
      WATCHDOG_INGRESS_SCOPE: 'user',
      WATCHDOG_INGRESS_READY_URL: 'http://127.0.0.1:20243/ready',
      WATCHDOG_PROXY_SERVICE: '',
      WATCHDOG_LOCAL_HEALTH_URL: 'http://127.0.0.1:3001/health',
      WATCHDOG_PUBLIC_HEALTH_URL: 'https://portable.invalid/health',
      ...overrides,
    },
  };
}

/** Sets the ActiveState the systemctl double reports for one unit. */
function setUnitState(fixture: WatchdogFixture, unit: string, state: string): void {
  fs.writeFileSync(path.join(fixture.root, `unit-${unit}`), `${state}\n`);
}

/** Sets how the curl double answers one probe. */
function setProbe(fixture: WatchdogFixture, probe: Probe, result: ProbeResult): void {
  fs.writeFileSync(path.join(fixture.root, `probe-${probe}`), result);
}

/** Runs one watchdog check with only the fixture environment. */
function runWatchdog(fixture: WatchdogFixture): ReturnType<typeof spawnSync> {
  return spawnSync(WATCHDOG, [], { encoding: 'utf8', env: fixture.environment });
}

/** Returns captured double invocations, or an empty string when none ran. */
function readCalls(fixture: WatchdogFixture): string {
  return fs.existsSync(fixture.log) ? fs.readFileSync(fixture.log, 'utf8') : '';
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('deployment availability watchdog', () => {
  it('changes nothing and stays quiet while the complete group is healthy', () => {
    const fixture = createWatchdogFixture();

    const result = runWatchdog(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    const calls = readCalls(fixture);
    expect(calls).toContain('curl http://127.0.0.1:3001/health');
    expect(calls).toContain('curl http://127.0.0.1:20243/ready');
    expect(calls).toContain('curl https://portable.invalid/health');
    expect(calls).not.toMatch(/ (start|restart) /);
  });

  it('starts a tunnel that exited cleanly and was left inactive', () => {
    const fixture = createWatchdogFixture();
    setUnitState(fixture, 'durisweb-cloudflared.service', 'inactive');

    const result = runWatchdog(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('durisweb-cloudflared.service is inactive; starting it.');
    const calls = readCalls(fixture);
    expect(calls).toContain('systemctl --user reset-failed durisweb-cloudflared.service');
    expect(calls).toContain('systemctl --user start --no-block durisweb-cloudflared.service');
    expect(calls).not.toContain('/ready');
    expect(calls).not.toContain('https://portable.invalid/health');
  });

  it('starts failed system units, including the proxy in front of the tunnel', () => {
    const fixture = createWatchdogFixture({
      WATCHDOG_SERVICE_SCOPE: 'system',
      WATCHDOG_INGRESS_SCOPE: 'system',
      WATCHDOG_PROXY_SERVICE: 'nginx.service',
    });
    setUnitState(fixture, 'durisweb-production.service', 'failed');
    setUnitState(fixture, 'nginx.service', 'inactive');

    const result = runWatchdog(fixture);

    expect(result.status).toBe(1);
    const calls = readCalls(fixture);
    expect(calls).toContain('systemctl --system start --no-block durisweb-production.service');
    expect(calls).toContain('systemctl --system start --no-block nginx.service');
    expect(calls).not.toContain('--user');
    expect(calls).not.toContain('curl http://127.0.0.1:3001/health');
    expect(calls).not.toContain('https://portable.invalid/health');
  });

  it('restarts an unready tunnel only after three consecutive failed checks', () => {
    const fixture = createWatchdogFixture();
    setProbe(fixture, 'ready', 'down');

    expect(runWatchdog(fixture).stdout).toContain('(1/3)');
    expect(runWatchdog(fixture).stdout).toContain('(2/3)');
    expect(readCalls(fixture)).not.toContain(' restart ');
    const third = runWatchdog(fixture);

    expect(third.status).toBe(1);
    expect(third.stdout).toContain('restarting durisweb-cloudflared.service');
    const calls = readCalls(fixture);
    expect(calls).toContain('systemctl --user restart --no-block durisweb-cloudflared.service');
    expect(calls).not.toContain('https://portable.invalid/health');
  });

  it('waits for the cooldown instead of restarting the same unit repeatedly', () => {
    const fixture = createWatchdogFixture();
    setProbe(fixture, 'ready', 'down');

    let result = runWatchdog(fixture);
    for (let run = 1; run < 6; run += 1) {
      result = runWatchdog(fixture);
    }

    expect(result.stdout).toContain('waiting for the cooldown');
    expect(readCalls(fixture).match(/ restart --no-block /g)).toHaveLength(1);
  });

  it('restarts the tunnel when the public route fails while the application answers locally', () => {
    const fixture = createWatchdogFixture();
    setProbe(fixture, 'public', 'down');

    runWatchdog(fixture);
    runWatchdog(fixture);
    const result = runWatchdog(fixture);

    expect(result.stdout).toContain('did not answer while the application answers locally');
    const calls = readCalls(fixture);
    expect(calls).toContain('systemctl --user restart --no-block durisweb-cloudflared.service');
    expect(calls).not.toContain('restart --no-block durisweb-production.service');
  });

  it('restarts an unresponsive application without blaming the tunnel', () => {
    const fixture = createWatchdogFixture();
    setProbe(fixture, 'local', 'down');

    runWatchdog(fixture);
    runWatchdog(fixture);
    const result = runWatchdog(fixture);

    expect(result.status).toBe(1);
    const calls = readCalls(fixture);
    expect(calls).toContain('systemctl --user restart --no-block durisweb-production.service');
    expect(calls).not.toContain('restart --no-block durisweb-cloudflared.service');
    expect(calls).not.toContain('https://portable.invalid/health');
  });

  it('reports but does not restart an application whose dependencies are degraded', () => {
    const fixture = createWatchdogFixture();
    setProbe(fixture, 'local', 'degraded');

    let result = runWatchdog(fixture);
    for (let run = 1; run < 4; run += 1) {
      result = runWatchdog(fixture);
    }

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'reports degraded dependencies: {"database":"error","cache":"ok"}',
    );
    expect(readCalls(fixture)).not.toContain(' restart ');
  });

  it('honors a recent pause and ignores an expired one', () => {
    const fixture = createWatchdogFixture();
    setUnitState(fixture, 'durisweb-production.service', 'inactive');
    const pause = path.join(fixture.state, 'pause');
    fs.writeFileSync(pause, '');

    const paused = runWatchdog(fixture);

    expect(paused.status).toBe(0);
    expect(paused.stdout).toContain('taking no action');
    expect(readCalls(fixture)).toBe('');

    const expired = new Date(Date.now() - 5 * 60 * 60 * 1000);
    fs.utimesSync(pause, expired, expired);
    const resumed = runWatchdog(fixture);

    expect(resumed.stdout).toContain('Ignoring the pause');
    expect(readCalls(fixture)).toContain(
      'systemctl --user start --no-block durisweb-production.service',
    );
  });

  it.each([
    ['STATE_DIRECTORY', 'relative-state'],
    ['WATCHDOG_SERVICE_SCOPE', 'global'],
    ['WATCHDOG_APPLICATION_SERVICE', 'durisweb;id.service'],
    ['WATCHDOG_INGRESS_SCOPE', ''],
    ['WATCHDOG_LOCAL_HEALTH_URL', 'http://192.0.2.10:3001/health'],
    ['WATCHDOG_PUBLIC_HEALTH_URL', 'https://token@portable.invalid/health'],
    ['WATCHDOG_INGRESS_READY_URL', 'http://192.0.2.10:20243/ready'],
  ])('refuses unsafe %s before touching systemd', (name, value) => {
    const fixture = createWatchdogFixture({ [name]: value });

    const result = runWatchdog(fixture);

    expect(result.status).toBe(78);
    expect(readCalls(fixture)).toBe('');
  });
});
