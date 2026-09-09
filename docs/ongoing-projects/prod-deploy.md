# Production deployment journal

## Scope and safety

- Started: 2026-09-09 UTC.
- Checkout: `/home/duris/website`.
- Objective: prepare a fresh DurisWeb checkout and its configuration for a later production
  deployment on the existing Duris VPS.
- Sensitive values, credentials, player data, and network addresses are intentionally excluded
  from this journal.
- No migrations, database writes, service starts, service restarts, ingress changes, MUD changes,
  or deployment cutover have been performed.

## Repository initialization

- Cloned `https://github.com/Community-Duris/DurisWebApp.git` directly into the project root rather
  than a nested directory.
- Initial branch: `master`, tracking `origin/master`.
- Checkout commit at initialization: `f6bf9086849890cdba5a078e833b55d346728547`.
- Repository instructions, environment contracts, deployment documentation, security guidance,
  and the local `scopeguard` skill were reviewed before configuration work.

## Host and prior-installation discovery

- DurisMUD production checkout: `/home/duris/duris`.
- Its mode-0600 `.env` was treated as the authority for the live database, MUD WebSocket, scoped
  Redis namespace and identities, and the MUD-side bridge credential.
- Existing MySQL, Redis, and Nginx services were active when inspected. All inspection was
  read-only.
- Nginx already serves `newduris.com` and `www.newduris.com`, routes `/api`, `/ws`, and
  `/socket.io` to backend port 3001, and has a separate TLS endpoint for the MUD WebSocket.
- The prior website checkout at `/home/duris/DurisWeb` was inspected read-only for compatible
  website-owned settings. Its legacy backend environment supplied the retained JWT, Ko-fi, R2,
  VAPID, and Gemini credentials.
- The prior website database credentials and bridge secret did not match the current MUD values;
  the current MUD database settings were selected.
- The prior website environment files were mode 0664. Their retained credentials should be
  rotated and those legacy files secured or retired as part of deployment cleanup.

## Environment files prepared

All three checkout-local environment files are ignored by Git, contain no example placeholders,
and were changed to mode 0600.

### Root `.env`

- Configured as an isolated local Compose/rehearsal input, not as the production database owner.
- Uses loopback-only bindings and non-conflicting host ports: 3307 for its disposable MySQL and
  6380 for its private Redis.
- Generated independent high-entropy MySQL root, MySQL application, and Redis passwords.
- The Compose Redis password matches the backend private-cache password.
- This Compose stack must not be treated as the live shared MUD database or started as a
  production cutover shortcut.

### `backend/.env`

- Configured for `NODE_ENV=production`, a loopback listener on port 3001, canonical HTTPS site
  URLs, and CORS for the apex and `www` site origins.
- Configured `MUD_DATABASE_MODE=shared` with the current production MUD database host, port, user,
  password, and schema.
- Configured `MUD_DIR=/home/duris/duris`, the loopback MUD WebSocket endpoint on port 4050, the
  `duris` process identity, explicit process paths, locale, shell, and `setsid` binary.
- Configured a future private DurisWeb cache on loopback port 6380 with an independent generated
  password. The live MUD Redis ACL is deliberately not reused for this general writable cache.
- Enabled MUD Redis integration using the current production namespace and distinct presence,
  cache, and donation ACL identities from the MUD environment.
- Enabled donation delivery using the retained Ko-fi verification token plus current MUD donation
  credentials and signing secret.
- Retained and enabled the prior R2, browser-push, Gemini, and guild-sync configuration.
- All four unsafe MUD-owned mutation gates were explicitly set to `false`.
- Selected `/home/duris/durisweb-backups` as the future owner-only backup directory; it has not yet
  been provisioned.
- `/usr/bin/bwrap` is configured as the required terminal sandbox target, but the binary is not
  installed. The administrative terminal must remain unavailable until it is installed and
  revalidated.

### `frontend/.env`

- Configured the production base path and public HTTPS API, WSS application socket, and retained
  R2 static-asset origin.
- Configured loopback-only Vite development and preview listeners.
- Allowed the apex domain, `www` alias, and localhost in the Vite host allowlist.
- No backend credentials were copied into browser-visible `VITE_*` variables.

## Bridge-secret finding

- The current MUD `DURISWEB_SECRET` is only 15 characters; the new backend requires at least 32
  bytes and correctly rejects that value.
- A new compliant high-entropy bridge secret was generated in `backend/.env` without printing it.
- The MUD environment was not modified. Before enabling the bridge, an authorized deployment step
  must copy the exact new backend value into the MUD environment and coordinate the required
  process recovery.
- Until that coordination occurs, bridge authentication is intentionally unavailable.

## Dependency and configuration verification

- Host runtime discovered: Node `v20.20.2`; ambient pnpm `10.27.0`.
- Installed both committed dependency graphs with Corepack pnpm `10.15.1` and frozen lockfiles.
  No dependency or lockfile versions were changed.
- Package installation reported ignored dependency lifecycle scripts, but both production builds
  subsequently completed successfully.
- `docker compose --env-file .env -f podman-compose.yml config --quiet`: passed.
- Placeholder and duplicate-key scans across all three local environment files: passed.
- Cross-file secret comparisons without printing values confirmed:
  - all selected database values match the current MUD environment;
  - all scoped MUD Redis identities match the current MUD environment;
  - the retained JWT and integration settings match the prior website environment;
  - the root Compose Redis password matches the backend private-cache password.
- `pnpm --dir backend config:check`: passed.
- The native `pnpm --dir frontend config:check` command could not run because Node 20 does not
  support the script's `--experimental-strip-types` flag. Running the same checked-in validator
  through the locked `tsx` executable passed.
- Read-only production dependency checks passed:
  - MySQL accepted `SELECT 1` using the selected configuration;
  - the MUD presence, cache, and donation Redis identities each accepted `PING`;
  - no database or Redis mutations were issued.
- The configured public map asset returned HTTP 200.

## Quality and build results

The following commands passed using Corepack pnpm `10.15.1`:

- `pnpm --dir backend format:check`
- `pnpm --dir backend lint`
- `pnpm --dir backend type-check`
- `pnpm --dir backend build`
- `pnpm --dir frontend format:check`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend type-check`
- `pnpm --dir frontend build`

Focused configuration tests also passed:

- Backend: 2 suites, 14 tests.
- Frontend: 2 files, 5 tests.

The complete backend and frontend test suites were not run because no application source behavior
was changed. MUD-write verification, migrations, the compiled production dependency preflight,
and runtime health checks were not run because no database/MUD write path was changed and the
private cache/application services are not deployed yet. The configuration-only production
preflight was run later with the dedicated Node 22 runtime and is recorded below.

## Gemini key attribution check

- The configured Gemini key exactly matches the key in the prior website backend environment.
- A read-only Gemini models request returned HTTP 200, confirming that the key is currently valid.
- Google API Keys project lookup returned HTTP 401 without an OAuth identity, as expected.
- This VPS has no Google Cloud CLI installation, saved Google Cloud account, repository Git email,
  or global Git email that can identify the owning account.
- An API key does not expose its creator's email. Ownership must be confirmed by signing into
  Google AI Studio or Google Cloud with a candidate account and locating the matching key/project.
- The key was never printed or added to this journal.

## Dedicated Node 22 runtime

- The current official Node 22 Linux x64 release, v22.23.2, was downloaded from `nodejs.org` and
  matched against its entry in the release's published `SHASUMS256.txt` before extraction.
- The runtime was installed owner-locally at
  `/home/duris/.local/opt/node-v22.23.2-linux-x64`; no system package was replaced.
- The deployment operator now selects that exact `node` binary and places its `bin` directory
  first in the application service `PATH`.
- The selected runtime reports v22.23.2. The VPS-wide `/usr/bin/node` remains unchanged at
  v20.20.2 for unrelated applications.
- With the dedicated runtime and each package's pinned pnpm 10.15.1, the compiled production
  configuration preflight and both backend and frontend configuration checks passed. The frontend
  validator now runs through its native package command without the earlier Node 20 limitation.

## Deployment operator file

- A user-created `deploy/deployment.env` was found untracked, not ignored, mode 0664, and still
  substantially based on the checked-in example.
- The documented deployment contract requires this operator input outside the checkout.
- It was moved to `/home/duris/.config/durisweb/deployment.env`.
- `/home/duris/.config/durisweb` is mode 0700 and the operator file is mode 0600.
- `DEPLOYMENT_ENV_FILE` inside the operator file was updated to that exact external path.
- The tracked `deploy/deployment.env.example` remains the repository template. The user's existing
  edit to that template is preserved.
- The external operator file was populated from the current MUD environment, the prepared backend
  environment, and read-only host discovery without printing credential values.
- It now selects the current checkout and build paths, the MySQL and production MUD service names,
  the existing Nginx ingress and Let's Encrypt files, and the loopback backend on port 3001.
- The private cache values follow the backend-owned Redis endpoint on loopback port 6380. They do
  not copy the MUD's separate shared Redis endpoint or credentials.
- Nginx remains enabled for `newduris.com` and `www.newduris.com` as the existing ingress.
  Cloudflared has also been explicitly enabled for the requested tunnel rollout. Its API token,
  account ID, and installed binary are set; its tunnel ID remains empty until Cloudflare permits
  creation of the tunnel.
- The selected render output, installed private-Redis configuration, and private-Redis data paths
  are owner-local and have been provisioned without linking or starting their services.
- The file remains a regular, non-symlink, owner-owned mode-0600 file. Its key set matches the
  maintained template, all enabled-group values are complete, and no required value retains an
  example placeholder.

### Deployment operator verification

- Normalized cross-file checks passed for the MUD checkout, shared production database selection,
  MUD WebSocket endpoint, backend listener, and independent private-cache endpoint.
- The configured owner-only render and private-Redis data directories were created under
  `/home/duris/.local/share/durisweb`.
- The real operator file rendered successfully into its permanent marked output directory with
  `deploy/scripts/render-config`.
- `systemd-analyze --user verify` accepted both permanent rendered service units.
- Scans of the permanent render found no unresolved template placeholders, `requirepass`, or
  embedded `CACHE_REDIS_PASSWORD` assignment.
- The rendered secret-free Redis base configuration was installed at the configured external path
  as an owner-owned mode-0600 file and is byte-identical to its rendered source.
- The installed Redis configuration passed an isolated Unix-socket-only startup, `PING`, and clean
  no-save shutdown smoke test. The configured production TCP port was not opened during the test.
- `sudo -n nginx -t` accepted the currently installed Nginx configuration, and the configured
  MySQL, Nginx, and production MUD units are enabled.
- The backend is not running on its selected loopback health endpoint. The current public
  `https://newduris.com/health` response is frontend HTML rather than structured backend health;
  ingress must route the exact public health path to the backend before acceptance can pass.
- No rendered unit was linked or enabled, and no production Redis start, application start,
  service restart, MUD change, or ingress installation occurred during this work.

### Cloudflare credential access check

- The deployment's Cloudflare values were inspected without printing the token, account ID, or
  any returned credential material. The operator file remained an owner-owned mode-0600 file.
- The token is an account-owned API token. Cloudflare's account-token verification endpoint
  returned HTTP 200 with active status and no expiration reported. The user-token verification
  endpoint is not applicable to this token type and returned HTTP 401.
- A read-only list request for non-deleted Cloudflare Tunnels in the configured account returned
  HTTP 200. This operationally proves account access and one of the accepted Tunnel Read
  permissions required by both tunnel listing and the launcher's tunnel-token endpoint.
- The account response contained zero non-deleted tunnels, and `CLOUDFLARE_WEB_TUNNEL_ID` remains
  empty. The exact tunnel-token request therefore could not be exercised before creating a
  resource.
- A read-only lookup of the token's own policy details returned HTTP 403, so the credential cannot
  enumerate its complete permission set. Required Tunnel Read access is proven operationally, but
  absence of unrelated excess permissions cannot be proven from this credential alone.
- The runtime launcher needs only read access to an already-created tunnel. Tunnel and DNS write
  access should therefore remain temporary bootstrap authority rather than permanent extra scope
  on the long-lived runtime token.

### Cloudflare tunnel rollout

- The user enabled `DEPLOY_CLOUDFLARED_ENABLED=true` and requested end-to-end Cloudflare setup for
  this application. Nginx remains enabled during preparation so the existing ingress is not
  removed before the tunnel path is healthy.
- The current official Linux amd64 `cloudflared` release, version 2026.8.3, was downloaded from the
  Cloudflare GitHub release and matched against the asset's published SHA-256 digest.
- The binary was installed owner-locally at
  `/home/duris/.local/opt/cloudflared-2026.8.3/cloudflared`, and `CLOUDFLARED_BIN` now selects that
  exact path. No system package or unrelated binary was replaced.
- User lingering was enabled for `duris`; `loginctl` now reports `Linger=yes`, allowing future user
  services to survive logout. No unit was linked or started by this change.
- The token can read the active `newduris.com` zone and its current apex and `www` DNS records. The
  existing apex MX record was identified and must be preserved during any web-record cutover.
- A temporary uniquely named TXT record was created and deleted successfully with HTTP 200 for
  both operations. This proves that the supplied token already has the required zone `DNS Write`
  permission, and the scope-check record left no residue.
- A request to create the remotely managed `durisweb-production` tunnel was refused by Cloudflare
  with HTTP 403/error 10000. The supplied runtime token has Tunnel Read but not the Tunnel Write
  authority required to create the resource. Cloudflare created no tunnel.
- No alternate Cloudflare origin certificate, tunnel credential, prior tunnel unit, or installed
  tunnel configuration was found on the VPS. The configured account therefore still contains zero
  non-deleted tunnels available to reuse.
- The permanent deployment render has not been refreshed with a Cloudflared unit because the
  required tunnel ID remains unavailable. Metrics port 20243 is unused, and no Cloudflared process
  or user unit is running.
- No DNS record, tunnel configuration, public route, application process, MUD process, database,
  Nginx configuration, or production service was changed during this incomplete rollout.

## Current deployment gaps

1. Add temporary account `Cloudflare Tunnel Write` authority to the supplied token, or create the
   `durisweb-production` tunnel through the Cloudflare dashboard. Zone `DNS Write` is already
   verified. The long-lived runtime token should retain Tunnel Read only after bootstrap.
2. Configure the tunnel ingress for the apex and `www` hostnames to the loopback application,
   preserve the apex MX record, set `CLOUDFLARE_WEB_TUNNEL_ID`, rerender, link/start the tunnel
   unit, and verify tunnel, DNS, HTTP, health, and WebSocket behavior end to end.
3. Coordinate the new bridge secret into the MUD environment without logging it.
4. Link the verified rendered application/cache units, then start and validate the private Redis
   service on port 6380 at the deployment-approved stage.
5. Provision `/home/duris/durisweb-backups` with owner-only permissions.
6. Install and validate the intended `bwrap` terminal sandbox, or keep the terminal unavailable.
7. Add and verify an ingress route that exposes structured backend health at the configured exact
   public `/health` URL.
8. Rehearse any pending forward migrations against a disposable restore before touching the live
   shared database.
9. Run the compiled production dependency preflight, stage immutable backend/frontend artifacts,
   install the reviewed ingress configuration, and complete the documented health, CORS,
   WebSocket, content, and rollback checks.
10. Rotate carried-forward third-party credentials and remove or secure legacy environment files.

## Current boundary

- The new backend, private cache, and MUD WebSocket listeners were inactive at the final
  configuration audit.
- Permanent rendered deployment artifacts and the installed Redis base configuration now exist,
  but the rendered units are not linked, enabled, or running.
- Build artifacts exist locally from verification, but they have not been installed or selected by
  a production service.
- Nothing in this journal constitutes authorization to migrate, start, restart, or deploy a live
  service.
