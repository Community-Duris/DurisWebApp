# Security & Compliance

> Cumulative security posture and GDPR record.
> **Line budget**: 1000 max | **Last updated**: 2026-09-09

---

## Current Security Posture

### Overall: AT RISK

| Metric | Value |
|--------|-------|
| Open Security Findings | 3 named: 2 High, 1 Low |
| GDPR Baseline | 9 gaps, 1 partial control |
| Phases Audited | 1 (Phase 00, 7/7 sessions validated) |
| Last Clean Phase | None |

Phase 00's scoped changes validated successfully and materially strengthened
the MUD integration boundary. The project is still at risk because two
auth/session findings remain High and privacy lifecycle requirements are not
implemented. Dependency audits are currently clean.

---

## Open Findings

### High

#### SEC-RT-1: Refresh tokens are stored as directly replayable JWTs

- **Introduced/confirmed**: [P00-S04], raised from the Session 01 survey.
- **Affected package**: `backend`.
- **Evidence**: `routes/auth.ts` inserts the refresh JWT verbatim into
  `web_sessions.refresh_token`; `sessionService.ts` compares the submitted raw
  token. DurisWeb and the MUD share this database.
- **Impact**: Read access through either codebase, a MUD database backup, or SQL
  injection yields active bearer tokens for every logged-in user. Replays are
  indistinguishable from legitimate refresh requests and tokens last up to
  seven days.
- **Remediation**: Store SHA-256 token digests and compare digests. Keep the raw
  token only in the client cookie. Deployment invalidates all existing sessions
  and therefore needs an explicit rollout/logout decision.
- **Status**: Open.

#### SEC-TZ-1: Session expiry can fail open when host timezones differ

- **Introduced/confirmed**: [P00-S03].
- **Affected package**: `backend`.
- **Evidence**: The application writes `expires_at` from a JavaScript `Date`,
  while `sessionService.ts` compares it with database `NOW()`. With the app at
  UTC+3 and MySQL at UTC, a token already expired by 60 seconds continued to
  authenticate and would have remained valid for nearly three more hours.
- **Impact**: Authenticated sessions silently outlive their intended expiry.
- **Remediation**: Store and compare UTC explicitly (`UTC_TIMESTAMP()` and/or a
  mysql2 `timezone: "Z"` policy), or fail startup when application and database
  timezones disagree. Add an offset-mismatch regression test.
- **Status**: Open.

### Medium / Low

#### SEC-3-2: Toggle and audit writes are not atomic

- **Introduced/confirmed**: [P00-S03].
- **Severity**: Low, accepted for now.
- **Affected package**: `backend`.
- **Evidence**: `hookSettingsService.ts` commits the safety toggle before its
  audit insert. If the audit write fails, the changed toggle remains and the
  error is logged, but no audit record exists.
- **Impact**: A control change can lose its durable attribution during a
  database partial failure.
- **Remediation**: Revisit transaction or outbox designs that preserve the
  higher-priority toggle even when audit persistence fails.
- **Status**: Open, accepted by design; do not silently make the incident safety
  control contingent on audit availability.

---

## MUD Integration Security Baseline

### Trust Channels

| # | Channel | Direction | Authentication / Boundary | Phase 00 Result |
|---|---------|-----------|---------------------------|-----------------|
| 1 | WebSocket bridge, port 4050 | MUD -> web | HMAC-SHA256 challenge with current/previous secret | Authenticated state/set protocol; remote plaintext refused; TLS verification explicit |
| 2 | Scoped Redis pub/sub | Both | Redis credentials plus namespace and season epoch | Legacy flat channels rejected by contract |
| 3 | Flatfiles and connection log | MUD -> web | Trusted filesystem under `MUD_DIR` | Canonical containment, bounded strict parsing, per-hook health; still unauthenticated by construction |
| 4 | Process control | Web -> MUD host | Admin permissions and constrained command construction | Existing permission/rate-limit contracts retained |
| 5 | Interactive terminal | Web -> host | Admin permission plus live per-session authorization | Always-on recovery path; bubblewrap deliberately shares network and PID namespace |

### Hook-Control Guarantees

- **[P00-S01/S07] Registry and ownership**: 14 immutable rows; 13 website
  toggles, eight MUD-backed hooks, five intentional MUD N/A hooks, and one
  always-on terminal recovery path. Generated behavior tests are cross-checked
  against the exact MUD tuple.
- **[P00-S02/S07] Source suppression**: MUD emitters return before payload
  construction; deletion authenticates and gates before payload parsing;
  disabled donations are dropped before application.
- **[P00-S03/S06] Server-authoritative UI**: Permission checks, optimistic-
  update refusal, mismatch/unknown display, audit context, and safe reconcile
  ordering are covered by backend and frontend tests.
- **[P00-S04/S07] Connection-scoped foreign state**: State is accepted only
  from an authenticated bridge, schema-validated, replaced wholesale, cleared
  on disconnect, and recovered only from a fresh report. Missing state is
  unknown/inactive.
- **[P00-S04] Transport and rotation**: `ws:` is allowed only on loopback;
  non-loopback requires `wss:`; URL credentials/query/fragment are rejected;
  certificate verification is explicit; the previous secret is tried exactly
  once after current-key rejection.
- **[P00-S05] Flatfile boundary**: Reads are realpath-contained and reject
  traversal, escaping symlinks, non-regular files, oversized or growing files,
  NUL, invalid UTF-8, truncated records, and unbounded search work. Failures are
  isolated per hook and exposed without raw paths or payloads.
- **[P00-S07] Cross-repository validation**: 13 website gates, eight MUD gates,
  five N/A owners, reconnect recovery, source guards, configuration, properties,
  state frames, and operator docs are pinned by executable contracts.

### Delivery and Operational Acceptance

- **[P00-external/DurisMUD]** MUD commit `df121bb3` is pushed on
  `feat/durisweb-hook-toggles` and intentionally unmerged. This is the requested
  handoff topology, not proof that the default MUD branch contains the feature.
- **[P00-infra]** Repository tests cannot prove an undeclared production reverse
  proxy. Before any cross-host bridge rollout, an operator must demonstrate a
  certificate-valid WSS connection without weakening the plaintext or
  certificate policies.
- **[P00-infra]** Local backend and frontend health checks pass. A hosting target
  and production health probes remain unset.

---

## GDPR Compliance Status

### Overall: NON-COMPLIANT BASELINE

The repository processes personal data for accounts, community features,
analytics, donations, operations, and automated suspicion scoring. No privacy
notice, pre-login analytics consent, general erasure workflow, or retention
enforcement was identified. This is an engineering inventory, not legal advice;
deployment jurisdiction and controller/processor roles still require owner
review.

### Personal Data Inventory

| Data | Package / Location | Purpose | Retention / Deletion |
|------|--------------------|---------|----------------------|
| Account and character names | `backend`; shared MUD `accounts` and related tables | Identity, login, authorization, game linkage | No general erasure path identified |
| Email addresses | `backend`; `accounts.email`, `user_profiles.email` | Recovery and account linkage | No documented retention |
| Refresh JWTs | `backend`; `web_sessions.refresh_token` | Session persistence | Up to 7 days; raw storage is SEC-RT-1 |
| IP addresses and reverse DNS | `backend`; page views, login history, action/wipe/builder/deploy/backup records | Security, analytics, geolocation, audit | No purge schedule identified |
| User agent, device, browser, OS, screen size | `frontend` collection, `backend` page-view storage | Analytics | Fingerprint-adjacent; no purge schedule |
| Geolocation, referrer, and UTM data | `backend`; `page_views` | Analytics and attribution | Derived/collected before login; no purge schedule |
| Visitor session identifiers | `frontend`/`backend`; visitor sessions and page views | Link pseudonymous browsing events | No purge schedule |
| Profile text, avatar, website, location | `frontend`/`backend`; `user_profiles` | Public profiles | User-editable, but no general erasure workflow |
| Forum content, reactions, votes, mentions | `frontend`/`backend`; `forum_*` | Community features | Poll vote history retains attributable records |
| Donor name, email, amount, message | `backend`; `donations` | Donation fulfillment and account linkage | Financial/identity data; no documented retention |
| Bans, moderation, and admin actions | `backend`; moderation/audit tables | Safety and accountability | No documented retention |
| Suspicion score and evidence | `backend`; `suspicious_accounts.evidence` | Multi-account detection | Automated profiling; no appeal/erasure path found |
| Push subscription endpoints | `frontend`/`backend`; push service storage | Browser notifications | Revocation exists at browser level; policy not documented |
| User-uploaded images | `frontend`/`backend`; Cloudflare R2 references | Profiles/community content | Feature deletion paths need end-to-end verification |

### Third-Party Transfers

| Recipient | Data sent | Package / Mechanism | Open concern |
|-----------|-----------|---------------------|--------------|
| Google Gemini (`gemini-2.5-flash`) | Account name, character name, IP, login timestamps | `backend`; `geminiSuspicionAnalyzer.ts` | Automated profiling and transfer are not disclosed in-repo |
| ip-api.com | Visitor IP | `backend`; `utils/geoip.ts` | IP is still logged on lookup/error paths |
| Ko-fi | Donor name, email, amount, message | `backend`; webhook and donation services | Processing/retention documentation absent |
| Discord | Notification content | `backend`; `discordService.ts` | Payload minimization not documented |
| Cloudflare R2 | Uploaded images | `backend`; `r2Service.ts` | Retention/deletion agreement not documented |
| Browser push providers | Endpoint and push payload | `frontend`/`backend`; push service | Provider role and retention not documented |

### Compliance Checklist

| Requirement | Status | Evidence / Next action |
|-------------|--------|------------------------|
| Purpose and privacy notice | GAP | No public privacy notice or processing record found |
| Consent before optional analytics storage | GAP | Page-view analytics includes pre-login visitors; no consent gate found |
| Data minimization | PARTIAL | Private presence defaults off unless explicitly enabled; page views still combine IP, device, geo, and screen data |
| Subject access/export | GAP | No complete user data export path identified |
| Deletion/erasure | GAP | No account-wide deletion/anonymization entry point identified |
| Retention enforcement | GAP | No purge job for analytics, login, or audit records identified |
| PII excluded from logs | GAP | Session 05 removed connection-sync IP logs; `utils/geoip.ts` still logs IPs |
| Third-party transfers documented | GAP | Transfers above are inventoried only in this internal file |
| Automated profiling disclosed/contestable | GAP | Gemini suspicion analysis has no subject notice or appeal path identified |
| Credentials protected at rest | GAP | Raw refresh JWT storage remains SEC-RT-1 |

---

## Dependency Security

Audit date: 2026-09-09. Counts are raw `pnpm audit` advisory results.

| Package | Scope | Critical | High | Moderate | Low | Total |
|---------|-------|----------|------|----------|-----|-------|
| backend | All dependencies | 0 | 0 | 0 | 0 | 0 |
| backend | Production only | 0 | 0 | 0 | 0 | 0 |
| frontend | All dependencies | 0 | 0 | 0 | 0 | 0 |
| frontend | Production only | 0 | 0 | 0 | 0 | 0 |

SEC-DEP-1 was resolved by refreshing both dependency graphs to patched releases,
upgrading Vitest to its fixed major line, explicitly selecting the patched
Workbox build peer, and removing an unused backend Tiptap dependency. No audit
finding was suppressed or ignored.

---

## Resolved Findings and Accepted Controls

| Phase / Session | Finding or Risk | Resolution |
|-----------------|-----------------|------------|
| P00-S02 | Low: admin-delete authorization ordering | Authentication and hook state are checked before request parsing or deletion. |
| P00-S02 | Medium: donation concurrency/partial application | Disabled events are discarded before application; concurrency path is contract-tested. |
| P00-S03 | SEC-3-1: unreadable local settings default enabled | Accepted directional policy: avoid severing all integrations while independent MUD gates remain authoritative. |
| P00-S04 | Loopback trust | Accepted and documented; plaintext is loopback-only and production cross-host use requires validated WSS. |
| P00-S04 | Secret rotation gap | Current key plus exactly one previous-key retry is implemented and tested end to end. |
| P00-S05 | Flatfile path/content attacks | Centralized boundary rejects escape, unsafe file type, oversized/growing, malformed, and unbounded input. |
| P00-S05 | Connection log PII emission | IP values are no longer included in connection-sync application logs. |
| P00-S07 | 1 Medium and 2 Low review findings | Gate-order assertion and handoff/commit evidence were repaired before validation. |
| 2026-09-09 dependency remediation | SEC-DEP-1 | Backend and frontend full and production-only `pnpm audit` checks report zero advisories. |

---

## Phase History

| Phase | Sessions | Security Result | GDPR Result | Opened | Closed |
|-------|----------|-----------------|-------------|--------|--------|
| P00 | 7/7 | Session validation PASS; cumulative posture AT RISK | NON-COMPLIANT baseline | SEC-DEP-1, SEC-RT-1, SEC-TZ-1, SEC-3-2 | 8 session findings/controls resolved or accepted |

---

## Next-Phase Priorities

1. **[P00-security] Decide the SEC-RT-1 rollout**, hash refresh tokens, and
   communicate the one-time global logout.
2. **[P00-security] Fix SEC-TZ-1** with explicit UTC semantics and a
   timezone-offset regression test.
3. **[P00-privacy] Assign a privacy owner** for notice/consent, transfer and
   profiling disclosure, retention schedules, and user export/erasure.
4. **[P00-infra] Prove production WSS and health probes** after a hosting target
   is selected; do not weaken transport policy to make rollout pass.
5. **[P00-data] Design the migration baseline and shared-schema ledger repair**
   as separate backup-first work before claiming clean-room deployability.

---

*Maintained as a durable project record.*
