# Direct production burn-in

Use this mode only after the user explicitly requests a production burn-in. It qualifies and, when
needed, repairs the production assets themselves. The final evidence must come from the actual live
database/cache/bridge, deployed backend and frontend artifacts, production service, and public
ingress—not only from a clone or staging environment.

An explicit production burn-in authorizes recovery-safe source repairs, the exact reviewed forward
migration set that passes the safeguards below, replacement of this application's generated
artifacts, and a controlled cycle of the positively identified DurisWeb application unit and its
tunnel, plus the dedicated test-account session lifecycle defined below. It does not authorize
down migrations, ledger edits, manual schema changes, database restores, unsafe MUD-owned-table
operations, credential/configuration changes, or restarts of the database, Redis, MUD, or unrelated
ingress services. Obtain separate explicit authority for any of those actions.

## Resolve the live target

1. Read all of `docs/deployment.md`. Inspect `durisweb-production.service` and the configured
   application service if it has another name. Resolve `FragmentPath`, `WorkingDirectory`,
   `EnvironmentFiles`, `ExecStart`, dependency units, and actual linked unit targets. Require the
   backend working directory and entrypoint to belong to this checkout. For direct mode, require the
   unit's backend entrypoint and frontend probe to equal this checkout's canonical `backend/dist/index.js`
   and `frontend/dist/index.html`, and confirm the backend serves that same frontend tree. If they do
   not, stop and establish an explicit path-specific promotion procedure; the fixed build commands
   do not prove a differently located live tree.
2. Read only the environment fields needed to prove `NODE_ENV=production` and establish the
   non-secret host, port, database name, cache namespace, site URL, and artifact paths. Do not
   source protected files into an interactive shell or print their values wholesale. Compare the
   running main PID's effective non-secret identity with the current unit environment/drop-ins that
   a restart will load; unexplained drift is a blocker because stop/start could switch targets.
3. Inventory `frontend/.env`, `.env.local`, and every `.env.production*`/`.env.development*` file,
   plus ambient `VITE_*` values. Resolve the effective production-mode public build values and
   classify every hostname from the frontend, `SITE_URL`, enabled nginx configuration, and tunnel
   routing by role: SPA/site or ingress alias, API, application WebSocket, static/CDN, and MUD. Every
   configured endpoint is in scope for its role-appropriate checks unless explicitly reported as
   untested.
4. Resolve every required host binary, especially `TERMINAL_SANDBOX_BIN`, without printing protected
   values. Require a regular executable with the intended bubblewrap-compatible identity; never
   substitute a shell or install host software under burn-in authority. An absent/incompatible
   sandbox makes the administrative terminal unavailable and the full burn-in partial.
5. Record the commit and dirty state; hashes and sizes of the current backend entrypoint,
   frontend `index.html`, and its generated assets; a generated asset currently served locally and
   through every SPA/site ingress alias; representative configured static/CDN content; and
   application/cache/database/MUD/ingress PIDs, active timestamps, results, and restart counts.
6. Record journal cursors or an exact UTC boundary for every relevant unit and current application
   log. Distinguish pre-existing diagnostics from burn-in output, but investigate both when they
   reveal a current defect.
7. Before invoking Knex, use a genuinely read-only database query to prove the production schema
   already contains `knex_migrations`, `knex_migrations_lock`, and exactly one unlocked lock row,
   then read the applied migration names. Knex `migrate:status` initializes missing ledger/lock structures, so
   it is not a safe discovery command until this invariant is proven. Stop without creating them if
   any are absent. Compare the read-only ledger with checked-in TypeScript migrations and record the
   exact pending filenames and hashes. Only then may
   `NODE_ENV=production pnpm --dir backend migrate:status` confirm the result. Do not apply pending
   files until the candidate-build, recovery, and rehearsal gates below pass. Use the existing
   verified dependency tree or a temporary exact-source workspace; never install into the live
   checkout merely to discover status.

## Establish recovery before mutation

Create the protected rollback set required by `docs/deployment.md` outside the checkout before
installing into or otherwise changing the live checkout. It must include checksum-verified copies
of the live `backend/dist` and `frontend/dist`; the current dependency trees or a tested frozen way
to reconstruct them; exact source, lockfile, frontend-build-input, unit, and configuration
identities; and a fresh transaction-consistent production database backup whose archive and
disposable restore have been validated. Record the last-known-good application-and-tunnel start
path. Keep credentials and row data out of the report.

If the rollback set cannot be created and verified, do not mutate production and report the
burn-in incomplete. Rehearsals and backups protect the direct run; they do not replace its live
checks.

## Qualify the candidate and rehearse migrations

Before package installation can affect the live checkout, create a protected isolated release
workspace containing the exact intended source and lockfiles, including deliberate worktree
changes but excluding environments, dependencies, generated artifacts, dumps, and runtime data.
Record a source manifest so the later direct build can be proven identical. Install frozen
dependencies including dev dependencies, run the complete shared source and isolated-test migration
sequence, and produce clean candidate backend and production-mode frontend builds there. Because
`frontend config:check` validates development mode, separately parse/validate the effective
production Vite inputs and confirm the candidate embeds the intended public endpoints. Supply the
candidate with mode-0600 copies of the exact protected backend and frontend build inputs only for
the commands that need them; do not source them, include them in the source manifest, or leave them
behind with the disposable workspace.

Run the compiled production configuration preflight in that workspace. Then follow the database
rehearsal procedure in `docs/deployment.md`; when migrations are pending, the rehearsal must include:

1. Restore the exact fresh production dump into disposable database and cache services matching
   production software versions on confirmed-unused loopback endpoints. Prove identity with an
   authenticated query and capture the ledger, required records, table shapes, and relevant row
   counts.
2. In a scrubbed environment that cannot fall back to production values, run `migrate:status`,
   `migrate:latest`, and `migrate:status` against the clone. Require the executed filenames to equal
   the early pending set exactly and require their hashes to match the recorded files.
3. Run the backend suite and freshly compiled dependency preflight against the migrated clone. For
   any migration that can touch a MUD-owned table or fingerprint, run the MUD checkout's canonical
   runtime/schema verifier too. Compare protected shapes, records, and promised-unchanged row counts;
   unexplained drift fails rehearsal.
4. Prove both the current known-good application and candidate application are compatible with the
   forward schema so artifact rollback remains viable. If the production dump or pending set changes,
   repeat restore and rehearsal from the new final backup.

Even with no pending migrations, run the candidate dependency preflight against the matching clone.
Do not treat an idempotent-looking migration, a successful clone migration, or a backup file that
was not restore-tested as sufficient evidence. A migration that may lock or alter MUD-owned state
also requires explicit player/MUD-impact authority and the MUD verifier; if it cannot run safely
while the MUD remains up, do not infer permission to stop the MUD.

## Source qualification and direct fresh build

After the isolated candidate, test-schema migration, and clone rehearsal all pass:

1. Compare live migration status with the rehearsed names and hashes and declare the
   maintenance/player-impact boundary. Pause the availability watchdog described in
   `docs/deployment.md`, then stop the exact application unit through its actual service manager;
   the tunnel is not bound to it and keeps running. Do not stop the database, cache, or MUD. Wait
   until the app PID and owned listener are gone, and verify out-of-scope dependency PIDs did not
   change.
2. Reconfirm that live source/lockfile hashes equal the qualified candidate. Install both live
   packages from their frozen lockfiles with dev dependencies explicitly included, using the
   recovery plan if dependency installation fails.
3. Move the exact live `backend/dist` and `frontend/dist` trees into the protected rollback set (or
   remove them only after byte-for-byte backup verification). Build directly into the artifact
   paths named by the production unit:

   ```bash
   pnpm --dir backend build
   pnpm --dir frontend build
   ```

4. Review complete output and verify the new backend entrypoint, frontend `index.html`, every
   referenced generated asset, modes/ownership, and hashes. No old file may survive merely because
   TypeScript did not clean its output. Require artifact hashes to match the qualified candidate;
   if a tool has known nondeterministic output, identify it and prove equivalent manifests and exact
   source, lockfile, environment, and toolchain inputs instead of accepting unexplained drift.
5. From `backend/`, run the freshly compiled configuration preflight with the scrubbed protected
   production environment. Immediately before any live migration, recheck the pending names and
   hashes, take and validate the final transaction-consistent backup, and repeat clone rehearsal if
   the backup or pending set invalidates prior evidence. If the identical recorded set is non-empty,
   apply it with `NODE_ENV=production pnpm migrate:latest`; if it is empty, do not invoke the mutating
   command. Immediately require `migrate:status` to show none pending and exactly the rehearsed names
   in the ledger. Only then run the live dependency gate:

   ```bash
   NODE_ENV=production node dist/scripts/productionPreflight.js --configuration
   NODE_ENV=production pnpm migrate:latest  # only for a non-empty, identical rehearsed set
   NODE_ENV=production pnpm migrate:status
   NODE_ENV=production node dist/scripts/productionPreflight.js --dependencies
   ```

   The status and dependency commands intentionally read the real production database and Redis;
   the one conditional `migrate:latest` is the only authorized schema mutation. Do not edit the
   ledger, restore data, or work around a schema refusal.

Before a live migration runs, a stopped-state failure restores dependency/artifact state and starts
the known-good application and its tunnel before extended diagnosis. After a migration starts,
never blindly restore old artifacts or the database: inspect actual schema/ledger state, use only an
already-proven schema-compatible application, and choose a new forward repair or separately
authorized database recovery. A migration already entered in the production ledger is immutable;
fix it with a new forward migration and repeat candidate build, backup, clone rehearsal, live apply,
and the entire burn-in.

## Start, acceptance, and soak

Start the exact application unit through its actual service manager/dependency graph and confirm
its configured tunnel is running. Its configuration and dependency preflights must execute normally;
do not bypass `ExecCondition` or `ExecStartPre`. Start that exact tunnel explicitly if it is not
running; do the same on a known-good rollback path. Remove the watchdog pause once acceptance passes.
Allow bounded listener startup retries, then apply the complete acceptance matrix in
`docs/deployment.md` against the configured local and public endpoints. At minimum verify:

- structured `/health` success for database and cache, plus `/api/ping` and complete
  `/api/site-config` endpoint fields at every API/ingress endpoint;
- SPA shell and newly built generated assets at every site/ingress alias, proving the new asset name
  and size or digest rather than accepting a cached old page, plus role-appropriate known map/static
  content at every static/CDN endpoint;
- allowed and rejected CORS origins, WebSocket `/ws` ping/pong, configured MUD WebSocket handshake,
  and applicable raw/TLS MUD paths;
- Redis/bridge state, migration status, freshly compiled dependency preflight, ingress redirects,
  TLS/HSTS/content types, and optional tunnel readiness;
- a safe non-destructive authentication/connectivity/contract probe for every enabled optional
  integration, including donations, R2, push, Gemini, and guild sync as applicable; never deliver a
  real donation/notification, incur unapproved external cost, or submit player data to force a pass;
- `ActiveState`, `Result`, main PID, active timestamp, and restart counts for the app and its
  dependencies, with database/cache/MUD PID preservation unless a separately authorized action
  explains a change;
- recent journal and application logs from the recorded boundary, using quiet journal output so
  an empty-log banner is not mistaken for an error.

Exercise `/`, `/status`, `/news`, `/pvp`, `/forum`, `/wiki`, `/guide`, `/auction`, and `/play` at
desktop and mobile sizes through every SPA/site or ingress-alias hostname, not through API-only,
WebSocket-only, static/CDN, or MUD hosts. Apply API, WebSocket, static, TLS, and MUD probes only to
their corresponding endpoint roles.

When an operator-approved dedicated production test/staff account is available and confirmed not to
trigger a legacy-account upgrade, a production burn-in authorizes only its bounded
login/session-refresh/logout writes and the expected web session/login/audit records. Capture the
relevant non-secret baseline, verify logout invalidates the session, and confirm no unexpected state
remains. Protected UI and WebSocket checks must otherwise be read-only and must not change account
data, content, configuration, MUD state, backups, deployments, player data, items, or auctions. If
the credentials or approval are unavailable, report a public-only partial pass, not a clean full
burn-in.

An enabled integration without a safe authorized probe is untested and makes the overall burn-in
partial; do not disable production functionality merely to claim a clean result.

Continue monitoring health, listeners, service properties, and logs for at least five minutes after
the last acceptance action, sampling at intervals no longer than 30 seconds. Require zero unexpected
restart-count changes, out-of-scope PID/timestamp changes, asset identity drift, unhealthy samples,
or new log findings throughout. Any failure restarts the repair loop; a restart that merely returns
to green is not a clean pass. If a finding cannot be repaired safely, use the schema-compatibility
decision above before restoring known-good dependencies/artifacts, restart the application and its
tunnel through the same service graph, verify recovery with the acceptance checks, and report the
production burn-in incomplete.
