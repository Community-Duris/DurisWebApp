# Architecture

## System Overview

DurisWeb is a two-package TypeScript application coupled to a separate C MUD
server and a shared MySQL schema. The Vue frontend talks only to the Express
backend. The backend owns HTTP/WebSocket APIs, persistence, caching, MUD
integration, and operator actions.

```text
Browser
  |
  | configured HTTPS / WSS ingress
  v
Vue frontend ---- HTTP / browser WebSocket ---- Express backend
                                                  |       |
                                      MySQL <-----+       +---- Redis
                                        ^
                                        | shared schema
                                        |
                                    DurisMUD (C)
                                        ^
                                        | bridge, pub/sub, files,
                                        | process control, terminal
                                        +-------------------------- backend
```

Production paths, dependencies, binaries, ports, hostnames, and ingress are
rendered from an operator-owned deployment input using `deploy/templates/`.
No machine-specific service or nginx artifact is authoritative in the checkout.

## Components

| Component | Location | Technology | Responsibility |
|-----------|----------|------------|----------------|
| Backend API | `backend/src/index.ts`, `backend/src/routes/` | Express 5, TypeScript | HTTP routes, browser WebSockets, middleware, static fallback |
| Domain services | `backend/src/services/` | TypeScript | Game data, community features, admin operations, MUD integrations |
| Hook control | `backend/src/hooks/` | TypeScript | Registry, cached settings, foreign state, resolution, activity and resource health |
| Data layer | `backend/src/db/`, `backend/migrations/` | mysql2, Knex, MySQL 8 | Shared database access and web schema evolution |
| Cache/pub-sub | `backend/src/db/redis.ts`, `backend/src/utils/scopedRedis.ts` | Redis 7, ioredis | Cache and scoped integration delivery |
| Frontend | `frontend/src/` | Vue 3, Vite, TypeScript, Pinia | Public, community, builder, and admin experiences |
| Hook console | `frontend/src/views/admin/mud/HookControlView.vue` | Vue 3 | Server-authoritative hook and transport operations |
| MUD server | external `MUD_DIR` checkout | C | Game runtime, bridge listener, property-backed MUD gates |
| Local dependencies | `podman-compose.yml` | Docker Compose, MySQL 8, Redis 7 | Developer database/cache containers |

## Data and Dependency Flow

- The frontend accesses MySQL and Redis only through the backend.
- DurisWeb and DurisMUD currently share one MySQL schema. The MUD owns its core
  tables, ledgers, and runtime shape outside the DurisWeb Knex chain. Historical
  DurisWeb migrations that altered MUD-owned structures are compatibility
  history, not precedent for new migrations.
- The 1.2.0 forward migration chain was replayed successfully against a restored
  production baseline on MariaDB 10.11. MUD-owned runtime schema is guarded by
  the migration and startup preflights. Historical down migrations are not a
  safe production inverse, so schema releases remain backup-first work.
- Redis serves ordinary application caching and separately scoped integration
  pub/sub identities. Legacy unscoped MUD channels are prohibited by tests.
- Browser build-time values use the `VITE_*` namespace and are public. Backend
  secrets must never cross that boundary.

## Shared Database Contract

The MUD migration manifest, persistence contract, and runtime compatibility
manifest are authoritative for game state: accounts, characters, inventories,
auctions, PvP records, statistics, and the corresponding ownership, balance,
revision, and audit ledgers. DurisWeb owns its web-extension tables and
projections. This ownership boundary applies whether the deployment selects a
shared database or a separate MUD database.

`backend/mud-write-allowlist.json` copies the MUD manifest's required-table
fingerprint and classifies every direct DurisWeb write to a MUD-owned table.
`pnpm --dir backend verify:mud-writes` rejects unclassified or stale statements,
dynamic table targets, and drift from the selected MUD manifest. An allowlist
entry records an existing boundary; it is not permission to add another writer
or evidence that the operation is safe.

The allowlist retains these audit references as stable contract labels, not as
project-status claims:

| Reference | Durable contract |
|---|---|
| `DB-01` | Auction bid and buy-now must move to an authenticated, idempotent MUD command that owns wallet, auction, custody, revision, and ledger changes. |
| `DB-02` | Item-duplicate repair belongs to a MUD reconciliation/quarantine operation; object UIDs cross the API as decimal strings. |
| `DB-03` | Player/season reset belongs to the MUD reset manifest, durable epoch, Redis invalidation, and reward policy. |
| `DB-10` | Every DurisWeb write to a MUD-owned table must remain explicitly classified and verified against the MUD manifest. |
| `DB-11` | The MUD owns the `statistics` schema and any index change; DurisWeb remains only a classified consumer/writer. |
| `DB-14` | The MUD owns the `pkill_event.stamp` contract; web compatibility code must not leak a relaxed SQL mode between pooled requests. |

### Migration baseline and provenance

Knex discovers only the TypeScript files in `backend/migrations/`. The legacy
SQL artifacts in that directory are deliberately excluded and individually
classified by `backend/migrations/sql-artifacts.json`; production configuration
preflight fails if that inventory is missing, stale, or incomplete. Some
artifacts classified as `baseline-pending-conversion` are still the sole
definitions of web-extension tables. Consequently, the historical Knex chain
cannot bootstrap an empty shared database.

Use a versioned, operator-approved schema baseline and verify migration
postconditions rather than editing the ledger or replaying every SQL artifact.
Do not add automatic `migrate:latest` to application startup. Development
fixtures should be deterministic and synthetic; a text-rewritten production
dump is neither a safe fixture nor a schema authority.

### Mutation authority and default-closed gates

Four legacy mutation groups remain present for compatibility but are closed by
default and return `503 operation_gated`:

| Gate | Closed operation | Authoritative replacement |
|---|---|---|
| `auctionWrites` | Direct web bid and buy-now wallet/auction writes | One MUD transaction with idempotency, custody, revision, refund, and ledger semantics. Administrative removal already uses the MUD critical command and is not gated. |
| `itemDeletes` | Direct deletion from player or locker item tables | MUD reconciliation or quarantine with before/after ownership evidence. Read-only duplicate diagnostics remain available. |
| `playerWipe` | Web-maintained table-list deletion | MUD-owned season reset with a durable fence/epoch, approval record, and resumable status. |
| `databaseRestore` | Legacy SQL filtering and row-merge restore | Manifest-bound, byte-preserving disaster recovery or a MUD-owned selective recovery operation. |

The corresponding `ALLOW_UNSAFE_*` settings acknowledge risk only; opening a
gate does not supply the missing transaction, ownership, or recovery contract.
See [Configuration and Environments](environments.md#unsafe-mutation-gates).

### Pooled session invariants

At startup, each configured MySQL pool verifies that checked-out connections
retain the server's effective SQL mode, isolation level, time zone, and foreign
key setting. The comparison ignores only mysql2's parser-only `IGNORE_SPACE`
session addition. Empty or otherwise weakened modes fail startup. A periodic,
non-overlapping sample logs drift detected after startup.

The PvP interaction compatibility path temporarily relaxes SQL mode for the
legacy MUD timestamp default. It captures and restores the exact prior value in
`finally`, and destroys rather than releases the connection if restoration
fails. New request handlers must not mutate pooled session state; the durable
fix for `pkill_event.stamp` belongs to the MUD schema owner.

### Generated projections

The supported wiki object/mob publisher records the selected MUD commit, tree
identity, and aggregate object/mob counts in `wiki_reference_generations`. It
parses from a private detached worktree at that verified revision, so a
concurrent branch switch cannot mix generations. It, the map extractor, and the
builder-flag synchronizer parse and validate a non-empty generation before
touching published rows. They replace their respective InnoDB rows inside one
transaction, in bounded insert batches, so a failure rolls back to the prior
generation. Empty source output is a hard failure, not a valid publication.
The wiki publisher also rejects an aggregate if any source input was dropped or
if the prerequisite builder-flag projection leaves mobile filter metadata
unresolved.
Production preflight checks the published object and mob markers, counts,
applicable filter metadata, and child consistency. Release acceptance must still
verify the enabled feature's API data and rendered surface.

Object- and mob-detail caches include the published source revision and tree in
their keys. Cache misses reconstruct flatfile-only detail, load-location, spawn,
and equipment data from a detached snapshot of that exact revision, then recheck
the generation marker before caching or returning the result. Mob readiness also
requires nonempty class, race, and flag metadata derived from the published rows.

### Restore boundary

The application's administrative backup creation and its restore feature have
different assurance levels. The two legacy restore endpoints are default-gated:
their filtered `REPLACE` merge is not a complete point-in-time restore, decodes
SQL content as UTF-8 despite possible binary payloads, and has no archive
manifest binding source, schema, table coverage, or target. An archive existing
or passing a compression check is not proof of recoverability.

Release recovery instead uses an operator-protected, transaction-consistent dump
restored first into an empty disposable database running matching software, then
checks schema/ledger identity, counts or digests, application smoke tests, and
MUD compatibility. A supported application restore would additionally need
byte-preserving streams, bounded archive expansion, credentials outside process
arguments, complete manifest checks, failure atomicity, and a dated drill with
measured RPO/RTO. Selective account or character recovery must reconcile the
MUD's ownership, custody, balance, revision, ledger, and cache state rather than
merge a partial row list.

### Data lifecycle boundary

Retention periods for web analytics, terminal/deployment output, login history,
and health metrics remain an explicit product/security/operations decision; see
the [security record](SECURITY-COMPLIANCE.md). Any lifecycle job
must be bounded, indexed for its cutoff, dry-runnable, idempotent, and audited.
Game-owned items, PvP payloads, statistics, and logs remain under the MUD's data
lifecycle contract and must not be added to an independent web purge job.

## MUD Integration Channels

| Channel | Direction | Trust Boundary | Key Controls |
|---------|-----------|----------------|--------------|
| Privileged bridge | MUD -> web, with web commands | HMAC-authenticated WebSocket | Production is same-host loopback; connection-bound challenge and current/previous secret |
| Scoped pub/sub | Both | Redis ACL credentials and deployment namespace | Namespace plus season epoch, dedicated roles, signed donation events |
| Flatfile/log ingestion | MUD -> web | Host filesystem beneath `MUD_DIR` | Canonical containment, file type/size/encoding validation, strict records, per-hook backoff |
| Process control | Web -> MUD host | Admin permission and command construction | `mud_control` permission, bounded request validation |
| Interactive terminal | Web -> host | Admin permission and live session authorization | `terminal_access`/overlord, short capability, bubblewrap/tmux; always-on recovery path |

Controls are channel-specific. Securing the bridge does not authenticate files
or make the terminal a complete sandbox.

## Hook Ownership and State

The immutable registry contains 13 website-toggleable hooks and one always-on
terminal row. Eight hooks also have a MUD property; five are website-only. The
effective state is computed from applicable owners rather than forcing every
row into a fictional two-ended shape.

Foreign MUD state is accepted only after bridge authentication, schema-
validated, replaced wholesale, cleared on disconnect, and considered unknown
when missing. Local settings-read failure defaults enabled to avoid severing
every integration during a database blip; missing foreign state remains
inactive so DurisWeb never fabricates MUD approval. Reconciliation disables the
website first and enables it last.

See [ADR 0001](adr/0001-hook-control-ownership-and-state.md) and the
[hook registry guide](../backend/src/hooks/README_hooks.md).

## Request Security

- CORS uses the allowlist in `ALLOWED_ORIGINS` and sends credentials.
- State-changing HTTP requests require a double-submit CSRF cookie/header,
  except the bounded analytics and Ko-fi webhook paths.
- Authentication uses HTTP-only JWT cookies bound to a live `web_sessions`
  record. Authorization combines game level/role and granular admin
  permissions.
- Request bodies and selected sensitive routes are size/rate limited.
- Known cumulative exceptions, including raw refresh-token storage and timezone
  expiry semantics, live in
  [Security and Compliance](SECURITY-COMPLIANCE.md).

## Health and Operations

- Backend `GET /health` checks MySQL and Redis concurrently and returns 503 when
  either fails.
- Frontend `public/health` is copied into the production build, while the
  Express production route at `/health` reports persistent dependency status.
- Local origin and public apex/`www` health are verified through the configured
  ingress. When Cloudflared is enabled, its dedicated tunnel also exposes a
  loopback-only readiness endpoint for operator checks and the availability
  watchdog, which restarts stopped or unready website units.
- The admin backup service creates local ZIP archives, but its legacy restore
  path is default-closed and is not the production recovery mechanism. Release
  backups and restore rehearsals are operator-managed, protected, and verified
  against an empty disposable target. Neither path is automated by CI.

## Key Decisions

- [ADR 0001: Hook control ownership and state](adr/0001-hook-control-ownership-and-state.md)
- [ADR template](adr/0000-template.md)
