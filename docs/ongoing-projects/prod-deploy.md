# Production deployment journal

Last checked: 2026-09-10 07:50 UTC.

## Current status

The website is live at https://www.newduris.com. Public cutover and live
acceptance have passed, including the post-restart bridge soak. Credential
hardening remains open; this is not a clean security/compliance sign-off.
This summary supersedes earlier preparation-only status and approval blockers.
The earlier blocked-task label was incorrect: the Cloudflare token works for
DNS, tunnel configuration, and tunnel startup. HTTP 403 from token-management
APIs limits credential-hardening work, not deployment or continued operation.
No replacement token is required to keep the accepted deployment running.

- The owner authorized end-to-end deployment, including the legacy web-baseline
  merge and required integration configuration.
- Application, private Redis, and Cloudflared system services are enabled and running
  as the unprivileged `duris` user. The former user-service group is disabled.
  The latest read-only check reports success and zero automatic restarts for all
  three. Application and tunnel have been active since 07:28:34 UTC, after the
  process-monitor fix. The fresh bridge soak exceeded 15 minutes without a
  changed connection report and completed normally with HTTP 200 logout.
- Both public hostnames return structured backend health with database and cache
  checks healthy. The canonical API ping returns HTTP 200 and `pong`.
- Apex page requests redirect with HTTP 308 to the corresponding canonical
  `www` URL; apex `/health` remains a direct backend health endpoint.
- The existing production MUD process remains active with its original PID and
  start time. It was not restarted during deployment.
- Credentials, player data, dumps, and generated deployment output remain outside
  tracked documentation. No secret values are recorded here.

## Completed deployment work

### Configuration and runtime

- Checkout: `/home/duris/website`; legacy web baseline:
  `/home/duris/DurisWeb`; authoritative MUD checkout: `/home/duris/duris`.
- Installed checksum-verified, owner-local Node 22.23.2 and Cloudflared 2026.8.3.
  The system Node installation was left unchanged. Package dependencies remain
  pinned to their existing lockfiles and pnpm 10.15.1.
- Prepared owner-only environment files and the external operator input at
  `/home/duris/.config/durisweb/deployment.env`. Rendered service units reside
  under `/home/duris/.local/share/durisweb/rendered`; user lingering is enabled.
- Provisioned `/home/duris/durisweb-backups` with owner-only permissions and
  secured the legacy backend environment file to mode 0600.
- Website bridge authentication now uses the existing valid MUD secret and was
  observed succeeding. The earlier short-secret finding is superseded; no MUD
  secret replacement or MUD restart was required.
- The website has its own private writable Redis cache. Dedicated shared-Redis
  presence-reader and donation-publisher identities were installed without
  repurposing the MUD writer identities. Presence reads were corrected to include
  the required pointer lookup.
- Redis AOF replay was validated against a protected copy before the shared Redis
  restart. The default identity remains disabled; anonymous access and presence
  reader writes were verified denied. The MUD PID was preserved.
- All four unsafe MUD-owned mutation gates remain disabled.
- Added explicit system/user service scope to rendering and recovery. System mode
  refuses root execution, keeps existing sandbox restrictions, and preserves
  shared-account IPC on stop. Both launchers use private systemd runtime
  directories. All three system units passed validation, dependency preflight,
  and complete-group acceptance after the 07:16 switch. MUD PID/start time were
  preserved; old user-unit links were removed and remain recoverable from snapshots.

### Database and published content

- Refreshed production and legacy-web dumps, then rehearsed the exact merge in a
  second disposable database. All 177 original MUD table checksums were unchanged
  through the rehearsed import and migrations.
- Imported only 75 legacy web-baseline tables into production; authoritative MUD
  accounts and game tables were not replaced with legacy data.
- Applied the nine pending forward migrations. The production ledger contains
  83 applied migrations with none pending; the MUD runtime compatibility verifier
  passed, including schema, ledger, baseline, index, and foreign-key checks.
- Published 918 builder flags across 25 categories, 20,213 wiki objects, and
  19,718 mobs from the current clean MUD source checkout.
- Compiled production dependency preflight passed with the intended Redis
  integration enabled. Disposable rehearsal services were stopped and their
  recovery data retained.

### Ingress and browser checks

- Created and started the production Cloudflare tunnel. Apex and `www` web
  records now point to it; the existing mail record was preserved. HTTPS
  enforcement is enabled, and public served JavaScript matched the local build.
- The canonical `www` tunnel route serves the application directly. The apex
  route goes through local Nginx for the canonical redirect and exact health
  proxy. Unmatched tunnel hostnames return 404. Installed Nginx configuration
  passed validation before reload.
- Canonical ingress is now reproducible: the optional operator setting
  `NGINX_CANONICAL_ORIGIN` renders `nginx/canonical-redirect.conf`. The installed
  Nginx site includes that artifact instead of its handwritten HTTP block,
  preserving its separately managed TLS vhost. After validation and reload,
  public HTTP 308 retained path/query strings and exact health remained HTTP 200
  backend JSON. Deployment acceptance passed without an application restart.
- Canonicalization addresses the observed cross-host CSRF-cookie mismatch when
  the apex frontend called the `www` API. Browser login through the apex now
  returns HTTP 200 and lands on the authenticated canonical forum, with no
  page errors or alert messages.
- Public application WebSocket ping/pong passed. CORS preflights allow both
  configured origins and reject an untrusted origin with HTTP 403 and no
  allow-origin header. HTTP redirects to HTTPS.
- Enabled Cloudflare HSTS with an initial one-day lifetime and `nosniff`, with
  preload and subdomain inheritance disabled. Both public health responses
  return the expected headers. The previous setting is saved privately as
  `security-header-before.json`; HTTPS must remain available during the cached
  HSTS lifetime, including any rollback.
- Corrected the imported browser-game endpoint to `wss://mud.newduris.com`.
- Browser checks rendered the home page at desktop and mobile widths without
  console errors or horizontal overflow. Public forums, wiki map, objects, mobs,
  and the play login screen rendered. Home screenshots are retained privately.
- A later nine-route pass at widths 1440 and 390 covered home, news, PvP, frag
  leaderboard, auctions, forums, wiki objects, mobs, and map with no HTTP failures,
  page errors, or horizontal overflow. PvP and auction empty states match zero
  rows in their authoritative source tables; news content is populated. Login
  screenshots show the correct form with no console warnings/errors or framework
  overlays at both widths.
- Configured raw TCP and certificate-validated TLS game endpoints connected and
  returned greeting bytes.
- The loaded MUD executable matches its on-disk binary and contains the
  authenticated-service exclusions in handshake and idle handling. Browser-game
  tests therefore proceeded while checking the existing authenticated bridge:
  desktop and mobile login, test-character entry, and `look` returned real game
  content without page errors or horizontal overflow. Quit was confirmed by the
  mobile account-menu event and dialog; the desktop test character was also
  absent from the subsequent live presence snapshot. Bridge state was preserved.
- The terminal now works in the actual system-managed application. Fixed its
  unbounded tab/Card sizing loop with a fixed-height, non-growing tab and bounded
  flex content. At widths 1440 and 390, its height stays stable, a harmless command
  returns the expected output, and disconnect/logout succeed with no page errors.
- Corrected process discovery to match the executable within the configured MUD
  checkout instead of searching command text for `./dms`. It rejects unrelated or
  ambiguous processes. The live monitor now identifies the actual MUD PID with
  positive uptime/memory, and public `/api/status` reports operational.
- Frontend builds were staged outside the checkout and selected through the
  `frontend/dist` symlink, retaining previous outputs/assets. Both public hostnames
  serve the expected `index-CJUzJJa1.js` digest. Prior compiled backend output was
  retained before installing the process-monitor fix and recovering the group.

## Verification recorded during deployment

- Both packages passed `format:check`, `lint`, `type-check`, configuration
  checks, and production builds using Node 22.
- Frontend full unit suite: 37 files, 155 tests passed.
- Backend initial full suite on an isolated clone: 99 suites / 793 tests passed;
  two suites / six tests failed because a required named account fixture was
  absent. After adding a synthetic disabled account only to the disposable
  clone, those two suites / six tests passed on targeted rerun. The complete
  suite was not rerun at that point; the final full rerun below supersedes this
  verification gap.
- Three focused deployment/recovery regression suites passed all 32 tests after
  the service-template adjustment.
- `verify:mud-writes` passed with 53 classified operations. Rendered units
  passed `systemd-analyze --user verify`; recovery acceptance passed.
- The 06:51 UTC documentation refresh rechecked service state, production deploy
  log outcomes, both public health responses, API ping, and the apex login
  redirect. It did not rerun builds, tests, migrations, or alter live services.
- Authenticated `/api/hooks` probes every 30 seconds from 06:54 through 07:01
  report the bridge connected, authenticated, unblocked, and no unknown hook
  states. Its report timestamp remains 06:45:55 UTC, exceeding the 15-minute
  service-descriptor timeout without a drop. All three services still report
  success and zero restarts; the MUD PID/start time remain unchanged.
  The browser monitor completed normally and logged out with HTTP 200 at 07:02.
- Repeated compiled dependency preflight and `recover-deployment --accept-only`
  passed (three units, two health probes); tunnel readiness returned HTTP 200.
  The only error-level application log since startup was the expected HTTP 403
  from the deliberate untrusted-origin CORS test.
- Final recovery `SHA256SUMS` covers 23 top-level files and passes
  `sha256sum --check --quiet SHA256SUMS`. Both database dumps and the build archive
  pass `gzip -t`. `git diff --check` passes. No package code changed during these
  acceptance checks, so package builds and test suites were not rerun.
- Canonical-renderer change: three deployment/recovery regression suites passed
  39 tests. Backend formatting (after correcting one new test's wrapping), lint,
  and type checks passed; shell syntax and `git diff --check` passed. No runtime
  TypeScript or frontend code changed, so builds/full suites were not rerun.
  `scripts/check-config-literals.sh` fails on existing frontend branding and
  machine-specific project-journal entries, including this requested journal;
  those unrelated entries were preserved rather than suppressing the guard.
- Subsequent system-scope, process-monitor, and terminal fixes: five focused
  backend suites passed all 61 tests. Backend formatting, lint, type checks,
  staged production build, and `verify:mud-writes` (53 operations) passed;
  the final added regression test was formatted and the focused suites rerun.
  Frontend formatting, lint, type-checked production build, and the full unit
  suite (37 files / 155 tests) passed after the final terminal layout fix.
  The final full backend rerun below subsequently covered these changes.
- The 07:44 UTC documentation refresh confirmed all three system services active,
  successful, and at zero automatic restarts; the MUD service retained its
  original PID/start time. Authenticated bridge probes through 07:44:04 UTC
  remained connected and authenticated with the unchanged 07:28:36 UTC report,
  exceeding the 15-minute timeout. The current system-scope recovery manifest
  passed `sha256sum --check --quiet SHA256SUMS`. This refresh made no runtime,
  configuration, or database changes and did not rerun package tests/builds.
- Final acceptance at 07:46 UTC: the monitor completed normally after its
  07:44:34 connected/authenticated sample and logged out with HTTP 200.
  `recover-deployment --accept-only` passed (three units, two health probes);
  `systemctl is-enabled` confirmed all three units enabled, and `systemctl show`
  confirmed active/success/zero restarts. The original MUD process still runs.
  Both public health responses passed database/cache checks, both hostnames
  served the exact current asset digest, and `/api/status` remained operational.
  The compiled `productionPreflight.js --dependencies` passed with 21 required
  tables and 83 migrations. Backend `format:check`, `lint`, and `type-check`
  were rerun successfully; `bash -n` passed for all three changed launch/render/
  recovery scripts. No tests, builds, migrations, or service restarts were run
  in this final audit.
- Post-07:28 application/tunnel journal review found no application errors or
  bridge disconnect/reconnect entries. Three tunnel startup warnings concern
  unavailable ICMP proxying and the UDP receive-buffer limit; public web tunnel
  acceptance passed with those restrictions unchanged.
- Final full backend rerun at 07:50 UTC: `NODE_ENV=test pnpm --dir backend test
  --runInBand` passed all 102 suites / 824 tests under Node 22. The isolated
  `durisweb_local` rehearsal database had 83 migrations and the previously
  prepared synthetic account fixture; the separate test cache used port 16380,
  not production cache port 6380. Environment values were explicitly isolated
  from production. No fixture, source, or production data changes were needed.
  Both disposable services were stopped afterward and their listener closure
  verified; their recovery data was retained. Complete-group live acceptance
  passed again with zero restarts. Private `backend-final-suite.log` was added
  to the system-scope checksum manifest, which verifies successfully.

## Post-deployment follow-up

1. Reduce temporary Cloudflare bootstrap authority to the required runtime scope
   and rotate carried-forward third-party credentials. Full token policy
   enumeration was denied, so least privilege has not been established. Fresh
   account token-list and permission-group reads both returned HTTP 403. An
   additional check also received HTTP 403 from user-level token-list and
   permission-group endpoints; neither management route is available. An
   account owner must provision replacement credentials through the protected
   operator configuration; do not paste them into this journal or chat. Do not
   revoke the existing credential before validating its replacement.
2. Retain the protected recovery sets below. The database restore/forward path
   was rehearsed on disposable services, but no live application rollback drill
   was performed. A verified archive alone is not proof of a successful live
   rollback; any rollback must repeat preflight and complete-group acceptance.
3. Track the pre-existing auth/session and privacy findings separately in
   [SECURITY-COMPLIANCE.md](../SECURITY-COMPLIANCE.md). Deployment did not resolve
   them. The configuration-literal guard remains nonpassing as recorded above;
   the full-backend-rerun gap is now closed.

## Recovery evidence

System-scope cutover snapshots, staged builds, prior frontend output, and terminal
evidence are under `/home/duris/.local/share/durisweb/releases/system-scope-RQmWbm`.
Its checksum manifest passed at final review. It includes accepted compiled
builds, the tracked source patch, and an archive of the new source files; these
capture the dirty-worktree deployment state alongside its then-recorded commit.
The deployment source changes are included in the commit containing this journal.
Keep `backend/dist` a physical directory when restoring compiled
backend output; the selected frontend is an external staged-directory symlink.
Recover system services, not the disabled former user-service group. Treat the
pre-system snapshots as historical recovery inputs, not a proven compatible
one-command rollback.

Canonical ingress pre-change operator input, Nginx vhost, and rendered artifacts
are retained under `/home/duris/.local/share/durisweb/releases/ingress-NhRkDN`.

Protected current artifacts: `/home/duris/.local/share/durisweb/releases/20260910-final`.
They include refreshed production and web-baseline dumps, pre-change environment,
Redis ACL, DNS, tunnel and Nginx snapshots, rehearsal/deployment logs, a build
archive, and browser screenshots. Dumps and build archive were checksum-verified
when prepared. Earlier rehearsal artifacts remain under
`/home/duris/.local/share/durisweb/releases/20260910T061833Z`.

Do not restore a whole pre-deployment shared database over ongoing MUD activity
without a separately coordinated recovery decision. Preserve the distinction
between website rollback and authoritative game-data recovery.
