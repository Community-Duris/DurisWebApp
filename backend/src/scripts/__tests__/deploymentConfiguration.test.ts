import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from '@jest/globals';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '../../../..');
const temporaryDirectories: string[] = [];

/** Writes a fully populated deployment input for one isolated render target. */
function writeDeploymentInput(
  temporaryRoot: string,
  outputPath: string,
  enableIngress = false,
): string {
  const inputPath = path.join(temporaryRoot, 'deployment.env');
  let example = fs
    .readFileSync(path.join(PROJECT_ROOT, 'deploy/deployment.env.example'), 'utf8')
    .replaceAll('example', 'portable')
    .replace('RENDER_OUTPUT_DIR=/srv/portable/durisweb-rendered', `RENDER_OUTPUT_DIR=${outputPath}`)
    .replace(
      'DEPLOYMENT_ENV_FILE=/etc/portable-durisweb/deployment.env',
      `DEPLOYMENT_ENV_FILE=${inputPath}`,
    );
  if (enableIngress) {
    example = example
      .replaceAll('replace_with', 'configured')
      .replace('DEPLOY_CLOUDFLARED_ENABLED=false', 'DEPLOY_CLOUDFLARED_ENABLED=true')
      .replace('DEPLOY_NGINX_ENABLED=false', 'DEPLOY_NGINX_ENABLED=true');
  }
  fs.writeFileSync(inputPath, example, { mode: 0o600 });
  return inputPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('deployment configuration renderer', () => {
  it.each([0o700, 0o777])(
    'uses a private systemd runtime directory for tunnel credentials (mode %s)',
    (mode) => {
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-tunnel-'));
      temporaryDirectories.push(temporaryRoot);
      const runtime = path.join(temporaryRoot, 'runtime');
      const binaries = path.join(temporaryRoot, 'bin');
      const input = path.join(temporaryRoot, 'deployment.env');
      fs.mkdirSync(runtime);
      fs.chmodSync(runtime, mode);
      fs.mkdirSync(binaries);
      fs.writeFileSync(input, '', { mode: 0o600 });
      const cloudflared = path.join(binaries, 'cloudflared');
      fs.writeFileSync(
        cloudflared,
        `#!/bin/sh
if [ "$1" = version ]; then echo 'cloudflared version 2026.8.3'; exit 0; fi
test -z "\${CLOUDFLARE_API_TOKEN:-}" || exit 9
printf '%s\\n' "$*"
`,
        { mode: 0o700 },
      );
      fs.writeFileSync(path.join(binaries, 'curl'), '#!/bin/sh\necho stub-response\n', {
        mode: 0o700,
      });
      fs.writeFileSync(path.join(binaries, 'jq'), '#!/bin/sh\ncat >/dev/null\necho stub-token\n', {
        mode: 0o700,
      });
      const result = spawnSync(
        'bash',
        [path.join(PROJECT_ROOT, 'deploy/scripts/run-durisweb-cloudflared')],
        {
          encoding: 'utf8',
          env: {
            PATH: `${binaries}:/usr/bin:/bin`,
            DEPLOYMENT_ENV_FILE: input,
            CLOUDFLARED_BIN: cloudflared,
            CLOUDFLARED_METRICS_ADDRESS: '127.0.0.1:20243',
            SERVICE_HOME: temporaryRoot,
            SERVICE_PATH: '/usr/bin:/bin',
            CLOUDFLARE_API_TOKEN: 'stub-api-key',
            CLOUDFLARE_ACCOUNT_ID: 'stub-account',
            CLOUDFLARE_WEB_TUNNEL_ID: 'stub-tunnel',
            RUNTIME_DIRECTORY: runtime,
          },
        },
      );
      if (mode === 0o700) {
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`--token-file ${runtime}/token`);
        expect(fs.readFileSync(path.join(runtime, 'token'), 'utf8')).toBe('stub-token');
        expect(fs.statSync(path.join(runtime, 'token')).mode & 0o777).toBe(0o600);
      } else {
        expect(result.status).toBe(78);
        expect(result.stderr).toContain('owner-only');
        expect(fs.existsSync(path.join(runtime, 'token'))).toBe(false);
      }
    },
  );

  it('renders every maintained artifact without unresolved placeholders', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    const generatedFiles = [
      'systemd/durisweb-production.service',
      'systemd/durisweb-redis.service',
      'systemd/durisweb-cloudflared.service',
      'deployment-selection.env',
      'redis/redis.conf',
      'nginx/bootstrap.conf',
      'nginx/production.conf',
    ];
    for (const relativePath of generatedFiles) {
      const content = fs.readFileSync(path.join(outputPath, relativePath), 'utf8');
      expect(content).not.toMatch(/@[A-Z][A-Z0-9_]*@/);
    }
    const selection = fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8');
    expect(selection).toContain('INGRESS_SERVICE=durisweb-cloudflared.service\n');
    expect(selection).toContain('INGRESS_SERVICE_SCOPE=user\n');

    const rerender = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );
    expect(rerender.status).toBe(0);
  });

  it('does not require or render disabled optional ingress groups', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-production.service'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-redis.service'))).toBe(true);
    expect(fs.existsSync(path.join(outputPath, 'systemd/durisweb-cloudflared.service'))).toBe(
      false,
    );
    expect(fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8')).toContain(
      'INGRESS_SERVICE=\n',
    );
    expect(fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8')).toContain(
      'INGRESS_SERVICE_SCOPE=\n',
    );
    expect(fs.existsSync(path.join(outputPath, 'nginx'))).toBe(false);
  });

  it('does not inherit optional ingress or service scope from the invoking environment', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.writeFileSync(
      inputPath,
      fs
        .readFileSync(inputPath, 'utf8')
        .replace(/^(DEPLOY_SERVICE_SCOPE|SERVICE_USER|NGINX_CANONICAL_ORIGIN)=.*\n/gm, ''),
    );
    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DEPLOY_SERVICE_SCOPE: 'system',
          SERVICE_USER: 'root',
          NGINX_CANONICAL_ORIGIN: 'https://unexpected.invalid',
        },
      },
    );
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputPath, 'nginx/canonical-redirect.conf'))).toBe(false);
    expect(fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8')).toContain(
      'DEPLOY_SERVICE_SCOPE=user\n',
    );
  });

  it('renders system-managed units with an unprivileged identity and preserves shared IPC', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.appendFileSync(inputPath, '\nDEPLOY_SERVICE_SCOPE=system\nSERVICE_USER=nobody\n');

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    for (const name of ['production', 'redis', 'cloudflared']) {
      const unit = fs.readFileSync(
        path.join(outputPath, `systemd/durisweb-${name}.service`),
        'utf8',
      );
      expect(unit).toContain('User=nobody\n');
      expect(unit).toContain('WantedBy=multi-user.target\n');
      expect(unit).toContain('RemoveIPC=false\n');
      expect(unit).toContain('NoNewPrivileges=true\n');
      expect(unit).not.toMatch(/@[A-Z][A-Z0-9_]*@/);
    }
    const selection = fs.readFileSync(path.join(outputPath, 'deployment-selection.env'), 'utf8');
    expect(selection).toContain('DEPLOY_SERVICE_SCOPE=system\n');
    expect(selection).toContain('INGRESS_SERVICE_SCOPE=system\n');
  });

  it.each(['root', '', '0', 'missing-deploy-test-user', 'nobody;id'])(
    'rejects unsafe or unavailable system-service identity %s',
    (user) => {
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
      temporaryDirectories.push(temporaryRoot);
      const outputPath = path.join(temporaryRoot, 'rendered');
      fs.mkdirSync(outputPath);
      const inputPath = writeDeploymentInput(temporaryRoot, outputPath);
      fs.appendFileSync(inputPath, `\nDEPLOY_SERVICE_SCOPE=system\nSERVICE_USER=${user}\n`);
      const result = spawnSync(
        'bash',
        [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
        { encoding: 'utf8' },
      );
      expect(result.status).toBe(78);
      expect(result.stderr).toContain('existing non-root user');
      expect(fs.readdirSync(outputPath)).toEqual([]);
    },
  );

  it('renders an optional canonical redirect while preserving exact health and ACME routes', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.appendFileSync(inputPath, '\nNGINX_CANONICAL_ORIGIN=https://www.portable.invalid\n');

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    const redirect = fs.readFileSync(
      path.join(outputPath, 'nginx/canonical-redirect.conf'),
      'utf8',
    );
    expect(redirect).toContain('return 308 https://www.portable.invalid$request_uri;');
    expect(redirect).toContain('location = /health');
    expect(redirect).toContain('proxy_pass http://127.0.0.1:8080/health;');
    expect(redirect).toContain('location /.well-known/acme-challenge/');
    expect(redirect).not.toMatch(/@[A-Z][A-Z0-9_]*@/);
  });

  it.each([
    'http://www.portable.invalid',
    'https://www.portable.invalid/',
    'https://www.portable.invalid/path',
    'https://token@www.portable.invalid',
    'https://www.portable.invalid;return 200',
    'https://$host',
  ])('rejects unsafe canonical redirect origin %s before rendering', (origin) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.appendFileSync(inputPath, `\nNGINX_CANONICAL_ORIGIN=${origin}\n`);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toContain('NGINX_CANONICAL_ORIGIN must be an HTTPS DNS origin');
    expect(fs.readdirSync(outputPath)).toEqual([]);
  });

  it('rejects public health URI user-info before writing rendered files', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    fs.mkdirSync(outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath, true);
    fs.writeFileSync(
      inputPath,
      fs
        .readFileSync(inputPath, 'utf8')
        .replace(
          'PUBLIC_HEALTH_URL=https://portable.invalid/health',
          'PUBLIC_HEALTH_URL=https://token@portable.invalid/health',
        ),
      { mode: 0o600 },
    );

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/PUBLIC_HEALTH_URL must be an exact HTTPS \/health URL/i);
    expect(fs.readdirSync(outputPath)).toEqual([]);
  });

  it('requires the operator to create a dedicated render output directory', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'missing-rendered');
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/existing non-symlink directory/i);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('rejects a symlinked render output directory', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const actualOutput = path.join(temporaryRoot, 'actual-rendered');
    const outputPath = path.join(temporaryRoot, 'rendered-link');
    fs.mkdirSync(actualOutput);
    fs.symlinkSync(actualOutput, outputPath);
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/symlink/i);
    expect(fs.readdirSync(actualOutput)).toEqual([]);
  });

  it('rejects a non-empty directory that was not created by the renderer', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'existing-directory');
    fs.mkdirSync(outputPath);
    fs.writeFileSync(path.join(outputPath, 'operator-owned.txt'), 'preserve me');
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/non-empty directory/i);
    expect(fs.readFileSync(path.join(outputPath, 'operator-owned.txt'), 'utf8')).toBe(
      'preserve me',
    );
  });

  it('rejects symlinked generated subdirectories on later renders', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-deploy-'));
    temporaryDirectories.push(temporaryRoot);
    const outputPath = path.join(temporaryRoot, 'rendered');
    const redirectedDirectory = path.join(temporaryRoot, 'redirected');
    fs.mkdirSync(outputPath);
    fs.mkdirSync(redirectedDirectory);
    fs.writeFileSync(path.join(outputPath, '.durisweb-render-output'), '', { mode: 0o600 });
    fs.symlinkSync(redirectedDirectory, path.join(outputPath, 'systemd'));
    const inputPath = writeDeploymentInput(temporaryRoot, outputPath);

    const result = spawnSync(
      'bash',
      [path.join(PROJECT_ROOT, 'deploy/scripts/render-config'), inputPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(78);
    expect(result.stderr).toMatch(/invalid render output subdirectory/i);
    expect(fs.readdirSync(redirectedDirectory)).toEqual([]);
  });

  it('writes Redis authentication to a private runtime config instead of process arguments', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-redis-'));
    temporaryDirectories.push(temporaryRoot);
    const runtimeDirectory = path.join(temporaryRoot, 'runtime');
    const sourceConfig = path.join(temporaryRoot, 'redis.conf');
    const capturedConfig = path.join(temporaryRoot, 'captured.conf');
    const capturedEnvironment = path.join(temporaryRoot, 'captured-environment.txt');
    const fakeRedis = path.join(temporaryRoot, 'redis-server');
    fs.mkdirSync(runtimeDirectory, { mode: 0o700 });
    fs.writeFileSync(sourceConfig, 'bind 127.0.0.1\n');
    fs.writeFileSync(
      fakeRedis,
      '#!/usr/bin/env bash\nset -euo pipefail\ncp -- "$1" "$CAPTURE_PATH"\nprintf "%s" "${CACHE_REDIS_PASSWORD-unset}" >"$CAPTURE_ENV_PATH"\n',
      { mode: 0o700 },
    );

    const result = spawnSync(
      path.join(PROJECT_ROOT, 'deploy/scripts/run-durisweb-redis'),
      [fakeRedis, sourceConfig],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CACHE_REDIS_PASSWORD: 'secret with spaces * and "quotes"',
          RUNTIME_DIRECTORY: runtimeDirectory,
          CAPTURE_PATH: capturedConfig,
          CAPTURE_ENV_PATH: capturedEnvironment,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(fs.readFileSync(capturedConfig, 'utf8')).toContain(
      'requirepass "secret with spaces * and \\"quotes\\""',
    );
    expect(fs.readFileSync(capturedEnvironment, 'utf8')).toBe('unset');
    const unit = fs.readFileSync(
      path.join(PROJECT_ROOT, 'deploy/templates/systemd/durisweb-redis.service'),
      'utf8',
    );
    expect(unit).not.toContain('${CACHE_REDIS_PASSWORD}');
    expect(unit).toContain('run-durisweb-redis');
  });
});
