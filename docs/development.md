# Development Guide

DurisWeb contains independent `backend/` and `frontend/` pnpm projects. There
is no root workspace manifest. Complete [Onboarding](onboarding.md), including
all three environment files, before running `./scripts/dev.sh`.

## Backend commands

| Command | Purpose |
|---|---|
| `pnpm --dir backend config:check` | Aggregate and report invalid backend configuration without connecting to dependencies |
| `pnpm --dir backend dev` | Run the TypeScript service with nodemon |
| `pnpm --dir backend build` | Compile TypeScript |
| `pnpm --dir backend test --runInBand` | Run Jest serially |
| `pnpm --dir backend format:check` | Check Biome formatting |
| `pnpm --dir backend lint` | Run ESLint |
| `pnpm --dir backend type-check` | Check TypeScript without output |
| `pnpm --dir backend verify:mud-writes` | Fail when a DurisWeb write to a MUD-owned table is missing from `backend/mud-write-allowlist.json` |
| `pnpm --dir backend migrate:status` | Inspect the selected Knex ledger |

## Frontend commands

| Command | Purpose |
|---|---|
| `pnpm --dir frontend dev` | Run the configured Vite development server |
| `pnpm --dir frontend config:check` | Validate public and Vite configuration without starting a server |
| `pnpm --dir frontend build` | Type-check and build `dist/` |
| `pnpm --dir frontend preview` | Run the configured Vite preview server |
| `pnpm --dir frontend test:unit --run` | Run Vitest once |
| `pnpm --dir frontend format:check` | Check Biome formatting |
| `pnpm --dir frontend lint` | Run ESLint |
| `pnpm --dir frontend type-check` | Check Vue/TypeScript projects |

## Complete quality matrix

```bash
./scripts/check-config-literals.sh
pnpm --dir backend config:check
pnpm --dir backend format:check
pnpm --dir backend lint
pnpm --dir backend type-check
pnpm --dir backend verify:mud-writes
pnpm --dir backend test --runInBand
pnpm --dir backend build
pnpm --dir frontend config:check
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend type-check
pnpm --dir frontend test:unit --run
pnpm --dir frontend build
```

## Database contract checks

`backend/mud-write-allowlist.json` is the operation-level inventory for direct
DurisWeb writes to MUD-owned tables. `verify:mud-writes` scans non-test backend
sources and fails on an unclassified or stale statement, a dynamic table target,
or divergence between its copied table fingerprint and the MUD migration
manifest. Classification documents a legacy or coordinated boundary; it does
not authorize new direct writes. The stable `DB-*` labels are defined in the
[shared database contract](ARCHITECTURE.md#shared-database-contract).

The verifier discovers standard CI and sibling-checkout layouts. For another
layout, pass its manifest explicitly as `--mud-manifest <path>`; this is a
tooling argument, not an application environment variable.

Knex loads only TypeScript migrations. Every excluded `.sql` artifact is
classified in `backend/migrations/sql-artifacts.json`, and production
configuration preflight rejects missing or stale classifications. Do not enable
all file extensions or replay the SQL set: it includes MUD-owned definitions,
one-off data repair, and web tables still awaiting a canonical baseline. The
historical chain is therefore not a zero-to-current bootstrap.

For database tests, copy `backend/.env.test.example` to `backend/.env.test` and
use isolated credentials/data. Source-text security tests pin sensitive
boundaries; update them only when the new structure preserves the policy.

Do not commit `.env` files, dumps, account data, generated deployment output,
or backup archives. See [Configuration and Environments](environments.md) before
adding any new setting.

## Local MUD process monitoring

Process monitoring selects one `dms` or `dms_new` process whose working directory
is the canonical `MUD_DIR` and whose executable is under its `bin/server/`
(or its supported legacy `dms` path).
Regression fixtures and other checkouts are excluded. Missing, malformed, exited,
or ambiguous candidates report stopped. Uptime comes from the same process
snapshot as the PID, so process exit cannot turn an empty second lookup into an
invalid boot timestamp during WebSocket reconnection.
