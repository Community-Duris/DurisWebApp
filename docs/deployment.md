# Deployment

Deployment is operator-controlled and has no repository-owned hostname, home
directory, port, service dependency, credential, or secret. The maintained
artifacts are templates under `deploy/templates/`; historical machine-specific
nginx and split frontend/backend service files have been removed.

## Build and validate

A pull changes source only; it does not prove that the running process or static
assets use that commit. Record `git status`, the exact commit, and the currently
served generated asset before changing anything. Run the complete non-mutating
quality matrix against isolated test dependencies:

```bash
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
pnpm --dir backend config:check
pnpm --dir frontend config:check
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
NODE_ENV=test pnpm --dir backend test --runInBand
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir backend build
pnpm --dir frontend build
./scripts/check-config-literals.sh
```

The backend test process must not inherit production database or Redis values.
Before a database-backed test or migration rehearsal, print and inspect only the
non-secret environment name, host, port, and database name; prove they identify
disposable services. A passing `config:check` proves syntax and policy, not
dependency identity or reachability. See [Configuration and
Environments](environments.md) for dotenv precedence.

`pnpm --dir frontend build` writes to `frontend/dist`. If that directory is
currently served, build in an isolated release workspace and stage the complete
output instead of changing the live tree underneath the old backend. Verify the
staged `index.html` and every referenced generated asset before cutover; do not
assume extra package-script arguments changed Vite's output directory.

From `backend/`, run the freshly compiled static and live gates with the selected
production environment installed:

```bash
node dist/scripts/productionPreflight.js --configuration
node dist/scripts/productionPreflight.js --dependencies
```

The first command aggregates invalid configuration and verifies the migration
bundle. The second verifies required tables, the canonical MUD-owned
`server_reboots` shape, absence of the prohibited incoming extension foreign
key, refresh-token column capacity, nonempty and internally consistent wiki
object and mob generations with persisted source identity, the complete
migration ledger, general cache, the optional scoped presence read/subscription
operations, and the auction engine/timestamp contract when direct auction writes
are explicitly enabled. Other feature projections still need explicit
data-readiness checks,
and neither preflight nor `/health` proves that a feature query is semantically
correct. They do not replace
the test suite or the release-specific acceptance checks below. The rendered
unit runs configuration as an `ExecCondition`; configuration refusal status 78
leaves the unit skipped instead of entering a restart loop.

### Publish wiki reference data

The wiki publisher verifies the configured `MUD_DIR`, materializes a temporary
detached worktree at its recorded revision, parses the complete object and mob
projection from that private snapshot, refuses an empty generation, and swaps
the whole projection in one transaction. Run it only from the selected clean
MUD checkout and record that checkout's immutable identities:

```bash
git -C /absolute/path/to/selected/mud-checkout status --short
git -C /absolute/path/to/selected/mud-checkout rev-parse HEAD
git -C /absolute/path/to/selected/mud-checkout rev-parse 'HEAD^{tree}'
pnpm --dir backend sync-flags
pnpm --dir backend wiki:publish \
  --source-revision <recorded-commit> \
  --source-tree <recorded-tree>
node backend/dist/scripts/productionPreflight.js --dependencies
```

Keep the recorded commit reachable from the configured MUD Git repository.
Wiki object- and mob-detail cache misses use that exact revision to reconstruct
flatfile-only details, including load locations, spawns, and equipment, without
reading whichever branch is currently checked out.

The status output must be empty. The flag sync must complete before the wiki
publisher because mobile race codes are resolved from that atomic projection.
The publisher refuses an aggregate with rejected flatfile input or missing mob
filter metadata. It stores the commit, tree identity, and published object/mob
counts with the same transaction as the rows. A failed
parse, insert, or marker write leaves the prior generation intact. Complete the
clone rehearsal and backup gates before publishing on a shared environment.

## Release evidence and rollback set

Before mutating production, create a mode-0700 release directory outside the
checkout. Store each sensitive artifact as mode 0600 and maintain a checksum
manifest. At minimum preserve or record:

- the release commit, dirty-worktree state, and last-known-good commit;
- pre-change backend/frontend environments and installed deployment config;
- rendered unit link targets plus loaded unit properties;
- the prior `backend/dist` and `frontend/dist` trees;
- a fresh transaction-consistent database dump including routines, events, and
  triggers, validated by the compression tool and a disposable restore;
- the database software version, selected non-secret endpoint, migration status,
  and declared expected data changes;
- pre-cutover service PIDs, active timestamps, restart counters, and ingress/DNS
  rollback identifiers when ingress will change.

Keep raw credentials and player rows out of the journal. The journal should name
protected artifact paths and checksums rather than reproduce their contents.
Do not remove the last-known-good artifacts or database dump when cleaning the
disposable rehearsal environment.

## Rehearse database changes

DurisWeb shares tables with the MUD, so every production schema release is a
backup-first forward migration:

1. Start disposable database and cache services on confirmed-unused loopback
   endpoints. Match the production database product and major/minor version.
2. Restore the exact fresh production dump. Use an authenticated `SELECT 1` as
   the readiness gate; a bare administrative ping can succeed before the
   intended identity/database is usable.
3. Confirm table names, the Knex ledger, required records, and row counts for all
   tables the release promises not to change. Account for known append-only
   activity between the dump and comparison rather than accepting unexplained
   drift.
4. With an explicitly isolated environment, run `migrate:status`,
   `migrate:latest`, and `migrate:status` against the clone. Confirm that only the
   reviewed pending files ran and that the resulting ledger has no pending
   entries.
5. Run the backend suite and the compiled dependency preflight against the
   migrated clone and isolated cache. Exercise the MUD runtime/schema verifier
   too when a migration can touch MUD-owned tables.
6. Restore-test the final backup and repeat the forward path if the production
   backup changed after rehearsal.
7. Immediately before the live migration, print and confirm the production
   environment plus non-secret database endpoint, compare the exact pending set
   with the rehearsal, and take a final backup. Apply only that reviewed forward
   set, then rerun status and the compiled dependency preflight.

The historical down chain is not a production recovery mechanism. Never repair
the shared ledger, replay pre-Knex SQL, or run a down migration merely to make a
status command green.

MUD-owned tables are authoritative. A web migration must preserve their sealed
column contract and must not add an incoming foreign key from a web extension
table that changes the MUD's runtime fingerprint. A successful web migration is
not releasable until both the compiled preflight and applicable MUD verifier
accept the clone.

### Application restore boundary

The rehearsal above uses an operator-created, transaction-consistent dump and
restores it into an empty disposable target. It is distinct from the admin
backup service's legacy restore path. Both application restore endpoints remain
closed unless `ALLOW_UNSAFE_DATABASE_RESTORE=true`; do not open that gate as a
release or incident-recovery shortcut. The current filtered `REPLACE` merge is
not a complete point-in-time restore, is not byte-safe for arbitrary BLOB data,
and has no source/schema/target manifest.

A backup is recoverable only after a matching empty-target drill verifies the
complete declared table scope, bytes, schema and migration identities, row
counts or digests, application behavior, and MUD ledgers. Record the archive
checksum, source and target, consistency method, software/schema versions,
RPO/RTO, and the last successful drill. Selective account or character recovery
requires a MUD-owned import/compensation operation that reconciles ownership,
custody, balances, revisions, ledgers, caches, and audit evidence. See the
[restore contract](ARCHITECTURE.md#restore-boundary).

## Render host configuration

Create the dedicated operator input outside the checkout:

```bash
install -m 0600 deploy/deployment.env.example /absolute/operator/path/deployment.env
```

Edit every value. `DEPLOYMENT_ENV_FILE` must name that same installed file;
`BACKEND_ENV_FILE` names the separately protected backend runtime environment.
The cache service consumes `CACHE_REDIS_PASSWORD` from the backend environment,
so that file is the credential owner for both the application and managed
Redis. Set `DEPLOY_CLOUDFLARED_ENABLED` and `DEPLOY_NGINX_ENABLED` explicitly;
values in a disabled group are ignored, while every value in an enabled group
must be replaced. `NGINX_SERVICE` names the system service recovered for an
Nginx-only ingress; Cloudflared remains the selected user service when both
groups are enabled. Health URLs must not contain URI user-info or credentials.
Then render:

```bash
deploy/scripts/render-config /absolute/operator/path/deployment.env
```

The required `RENDER_OUTPUT_DIR` receives:

- systemd units for the application and private Redis cache;
- a Redis base configuration without an embedded password;
- the Cloudflare unit when its group is enabled;
- bootstrap and TLS nginx configurations when their group is enabled;
- a non-secret deployment selection consumed by the complete-group recovery
  and acceptance command.

The renderer rejects missing values, unsafe input permissions, symlinks,
unresolved/example placeholders, and missing or non-empty unmarked output
targets. Create the dedicated output directory before rendering; the renderer
marks it so later renders can update only that owned location. Inspect the
output, install the Redis/nginx files at the configured paths, and link the
rendered systemd units from their actual output directory. At service start,
`run-durisweb-redis` copies the installed base
configuration into systemd's mode-0700 runtime directory and appends the
backend-owned password to a mode-0600 runtime config; the secret never appears
in `ExecStart`. For user services, enable linger for the selected service
account and verify `Linger=yes` before enabling units.

`DEPLOY_SERVICE_SCOPE=user` is the default. To use the system manager instead,
set `DEPLOY_SERVICE_SCOPE=system` and `SERVICE_USER` to an existing non-root
account. All website units then use that identity and `multi-user.target`;
the recovery selection records their scope. System mode preserves IPC owned
by the account on service stop because it may also own the separately managed
MUD. Both launchers use systemd's private `RUNTIME_DIRECTORY`, which works in
either scope without relying on a login session's runtime directory.

Some AppArmor hosts implicitly confine user-service namespace setup before
bubblewrap executes. A profile for bubblewrap alone may not overcome that
inherited restriction. Validate the exact sandbox flags under the chosen
manager. System mode can preserve the same unit restrictions while running as
the unprivileged account; do not disable host-wide user-namespace protection.

The application unit permits the mount, user, IPC, UTS, and cgroup namespaces used
by its bubblewrap terminal; PID and network namespace creation remain denied.
On hosts restricting unprivileged user namespaces through AppArmor, install a
profile for the configured bubblewrap executable that permits `userns`, and
verify the terminal sandbox under the application unit's restrictions.

The cloudflared launcher validates the deployment file ownership/mode, obtains
a short-lived tunnel token from the configured account/tunnel, and restricts
the child environment. It selects token-file handling only for compatible
cloudflared versions.

### Install rendered artifacts

Treat the render directory as installed state: linked units depend on it, so do
not remove or rotate it out from underneath systemd. Use this order:

1. Inspect the rendered files for unresolved placeholders and unexpected secret
   material. The Redis base file must not contain `requirepass`.
2. Install the rendered Redis/nginx files at their configured destinations.
3. Verify every rendered unit before linking it:

   ```bash
   systemd-analyze --user verify /absolute/render/output/systemd/*.service
   ```

4. Link the exact enabled-group units from the render directory. `--force` is
   appropriate only after resolving the current links and proving they are the
   intended DurisWeb units:

   ```bash
   systemctl --user link --force /absolute/render/output/systemd/durisweb-redis.service
   systemctl --user link --force /absolute/render/output/systemd/durisweb-production.service
   systemctl --user link --force /absolute/render/output/systemd/durisweb-cloudflared.service
   systemctl --user daemon-reload
   ```

   Omit the optional tunnel unit when Cloudflared is disabled. Reload only after
   all link targets and installed configs exist. Resolve the links again after
   reload and compare PIDs/active timestamps; a daemon reload should not be
   assumed to restart or preserve a service without evidence.

5. Enable units only after their dependencies, preflights, and local health have
   passed. Keep old unit definitions in the protected release snapshot rather
   than in the checkout.

Manual invocations of an account-local Redis binary or `redis-cli` may require
the same `REDIS_LIBRARY_PATH` rendered into the cache unit. A dynamic-loader
error occurs before network authentication and must not be diagnosed as a bad
Redis credential.

For system scope, use `systemd-analyze verify` and install root-owned copies of
the reviewed units under `/etc/systemd/system` instead of linking them into a
user manager. Run `systemctl daemon-reload`, then start/enable only the selected
system group. Keep the operator input owned by `SERVICE_USER` for the tunnel
launcher's ownership check. `recover-deployment` selects `--system` from its
rendered control file; starting system services requires the corresponding
operator authority. Read-only `--accept-only` checks can run as the render owner.
Never leave both managers enabled on the same listener ports. Snapshot the old
group, stop it completely, start the new group, and re-run acceptance and the
bridge soak. Switching managers is a coordinated application/cache/tunnel
restart, not a database or MUD restart.

## Cutover sequence

For a visitor-facing maintenance reason that survives an offline origin/tunnel,
prepare the optional [edge availability notices](../deploy/maintenance/README.md)
before the window. Its operator switch and frontend popup are separate from
service recovery; committing the implementation does not activate either.

Inspect reverse dependencies before restarting any database or Redis service.
The maintained application unit `Requires=` its private cache. The maintained
tunnel unit `BindsTo=` and is `PartOf=` the application, so a cache restart can
stop the app/tunnel and a deliberate app restart should cycle its tunnel. A
shared MUD Redis or database can have separate hard dependencies that make its
restart player-visible.

1. Declare any required maintenance window and record connected-player impact.
   Capture the app, cache, tunnel, database, and MUD PIDs, active timestamps, and
   restart counters.
2. Pass the clone rehearsal, final live migration gate, compiled preflights, and
   rendered-unit verification before stopping healthy processes.
3. If the private cache configuration changed, restart the cache first and
   expect the app/tunnel dependency chain to stop. Verify authenticated `PONG`.
4. Switch the complete staged backend/frontend artifacts. Do not expose a
   partial frontend build.
5. Recover the complete rendered group and require acceptance before ending
   maintenance:

   ```bash
   deploy/scripts/recover-deployment /absolute/render/output
   ```

   This explicitly starts the cache, application, and selected optional ingress,
   then requires `ActiveState=active`, `Result=success`, `NRestarts=0`, and
   bounded local and configured public `/health` responses with the
   `durisweb-backend` service identity and healthy database/cache checks. Use
   `--accept-only` to prove the same gate without starting anything. An
   Nginx-only selection uses `systemctl --system`; run recovery from an operator
   identity already authorized to start that configured service. The command
   does not elevate privileges or invoke `sudo`.
6. Do not restart the MUD or shared database as part of a web-only release.
   Compare their PIDs and active timestamps with the pre-cutover record.
7. Enable the validated units and run the acceptance matrix. Unexpected
   `NRestarts`, dependency restarts, or a mismatched served asset stop the
   release and trigger rollback analysis.

## Acceptance and rollback

Listener startup can race the first probe. Use a bounded retry that includes
connection-refused, then require structured content from the real route. The
backend readiness path is `/health`, not `/api/health`; an unknown path can be
served by the SPA fallback, so HTTP 200 alone is not health evidence.

```bash
curl --fail-with-body --connect-timeout 5 --max-time 15 \
  --retry 15 --retry-max-time 60 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:3001/health \
  | jq -e '.status == "ok" and .service == "durisweb-backend" and .checks.database == "ok" and .checks.cache == "ok"'
```

Use the configured origin rather than the example port. After start or restart,
verify:

- the configured local and public health endpoints;
- `/api/ping`, `/api/site-config`, the SPA shell, and a generated asset;
- allowed-origin CORS and rejection of an untrusted origin;
- browser application WebSocket ping/pong, plus fresh authenticated MUD bridge
  state. If a direct MUD WebSocket handshake must be tested, do it before the
  backend owns the deployment's single service connection or from an isolated
  identity; a competing same-host connection can evict the live bridge (tracked
  in [DurisMUD #116](https://github.com/LuminariMUD/DurisMUD/issues/116));
- raw/TLS MUD connections when those endpoints are enabled;
- HTTP-to-HTTPS redirects and intended HSTS/content-type hardening at public
  ingress;
- Redis connectivity, authenticated bridge state, and unexpected restart count;
- service `ActiveState`, `Result`, `NRestarts`, PID/timestamp preservation for
  out-of-scope dependencies, and the optional tunnel readiness endpoint;
- `migrate:status` with no unexpected pending files and the freshly compiled
  dependency preflight;
- recent error-priority logs. Use `journalctl --quiet` in assertions so its
  literal `-- No entries --` banner is not mistaken for an error.

When the frontend uses an absolute canonical API origin, redirect website aliases
to that origin before serving the SPA. Host-only CSRF cookies cannot be read by
JavaScript on a different hostname, even when CORS permits both origins. Verify
login through each public alias, not just the canonical login page. Preserve the
exact backend health route when an alias is routed through a redirect proxy, and
record that proxy configuration with the release's ingress recovery artifacts.

For a tunnel alias routed through Nginx, set the optional operator value
`NGINX_CANONICAL_ORIGIN` to the canonical HTTPS DNS origin (no port, path, or
trailing slash). The renderer then produces `nginx/canonical-redirect.conf`,
which preserves ACME and exact `/health` routes and redirects other requests
with HTTP 308. Install or include this artifact **instead of** the existing
HTTP vhost for those names; do not install both it and the HTTP server from
`production.conf` or `bootstrap.conf`. Keep the canonical tunnel hostname routed
directly to the application to avoid a redirect loop. Blank disables generation;
if retiring a previously installed redirect, explicitly remove its live include
and review any previously generated artifact before deploying replacements.

For a Cloudflare-terminated deployment, verify security headers at the edge, not
only at the origin. Its `security_header` zone setting can supply HSTS and
`nosniff`. Start with a deliberate HSTS lifetime and leave subdomain inheritance
and preload disabled unless all affected endpoints have been qualified. Save the
prior setting and keep certificate-valid HTTPS available throughout the cached
HSTS lifetime during recovery. See the
[Cloudflare HSTS requirements](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/#requirements).

Exercise every enabled, data-backed public surface with its feature-specific
readiness assertion and a real browser at representative desktop and mobile
viewports. HTTP 200, table existence, or an empty-state component is not proof
that profiles, forum categories, wiki objects/mobs, or map bounds are usable.
Require meaningful content, the intended route/origin, no framework overlay or
unexpected console/request errors, and no horizontal overflow.

The dependency preflight rejects a forum that has no non-archived public or
authenticated root category. For a fresh installation, run `pnpm forum:bootstrap`
from `backend/` after migrations. The command is transactionally idempotent: it
adds only missing categories from the approved minimal taxonomy and preserves
all existing identifiers, custom categories, threads, and posts. An administrator
with the configured forum-moderation permission can instead use **Set up the
first category** on the empty forum screen. Do not treat private-only or archived
categories as ordinary-user readiness.

Hold the stability soak across the longest relevant idle and reconnect boundary.
While DurisMUD #116 applies, exceed its 15-minute service-descriptor timeout and
require no unexplained bridge drop/reconnect. Do not open another MUD WebSocket
during that soak; use DurisWeb's structured bridge state and correlated logs.

Prove release identity by extracting a generated asset name from the staged
build and requiring that exact asset (and expected size or digest) locally and
through every public hostname. A healthy old process or cached old SPA is not a
successful deployment. Confirm the browser-safe site configuration contains the
complete intended endpoint fields, not merely valid JSON. Prefer immutable asset
identity over public HTML byte identity when the edge injects per-response
content.

Schema releases remain backup-first. Restore a transaction-consistent backup to
disposable matching database software, apply the forward chain, compare tables
and row counts, and run the production preflight before touching production.
Historical down migrations are not the recovery plan.

Application rollback uses an explicitly selected last-known-good commit whose
migrations are compatible with the live schema, followed by rebuild, preflight,
and the same complete-group recovery command and acceptance checks. DNS and
database rollback targets must come from a fresh operator journal, never
tracked documentation.

For the fastest code-only rollback, restore the checksum-verified prior compiled
artifacts and rendered/unit configuration, restart through the same dependency
graph, and repeat the full acceptance matrix. A database rollback is a separate
operator-authorized restore from the verified pre-change dump; do not infer it
from application rollback. Restore ingress/DNS only from the pre-cutover
readback recorded for that release.

After acceptance and a stability soak, gracefully stop disposable services,
verify their listeners are closed, and remove only their resolved exact paths.
Retain the release snapshot according to the operator's recovery policy. Fold
new durable lessons into this guide; do not retain a tracked machine-specific
deployment diary as permanent documentation.

## Automation boundary

`.github/workflows/quality.yml` installs each package independently and runs the
configuration-ownership guard plus formatting, lint, and type checks. It does
not run the full test suites, build or publish release artifacts, migrate a
database, mutate ingress, or deploy production. Those gates and release
authority remain explicit operator responsibilities.
