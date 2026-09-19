# Release 1.0 gate prep — local Cloudflare read-only compatibility proof

**Status: local gate-prep prototype only. Not an accepted Release 1.0 candidate. Not deployed.**

Issue #21 authorizes only a local compatibility/cost proof for the accepted Release 0.9 read-only operator case. No permanent or temporary Cloudflare resource, Zero Trust organization, Access policy, custom domain, DNS change, customer/private evidence, billing change, or cloud deployment is authorized by this guide.

## Why this proof exists

Accepted Release 0.9 proved the operator case view locally over the accepted SQLite repositories. The remaining gate question is whether that exact service-history view can run on a minimal Cloudflare Worker + D1 read path without weakening tenant authority, inventing a new authentication database, porting the ingestion/write model, or exceeding the target free-tier proof envelope.

This gate deliberately does **not** solve cloud ingestion/write portability. The accepted local write path uses interactive SQLite transaction semantics that D1 does not expose in the same form. That question remains separately gated.

## Local architecture

The prototype has four bounded pieces:

1. **Narrow operator read boundaries**
   - `OperatorEvidenceReadRepository`
   - `OperatorReviewReadRepository`
   - additional narrow aliases for the accepted persisted diff and recommendation-evidence helper.
   - Full accepted repository interfaces remain unchanged.

2. **Read-only D1 adapters**
   - selected collection read;
   - one-statement persisted collection snapshot with bounded observations and derived progress counts;
   - canonical observation read;
   - bounded current recommendation/history/measurement/outcome reads.
   - No D1 write method or fake write stub exists on the runtime adapter.

3. **One minimal Worker**
   - `/health`;
   - `/operator-case`;
   - Access context required before operator content;
   - exact configured operator email checked again in the Worker;
   - existing authenticated-principal seam creates the trusted `TenantContext`;
   - tenant/site/scope and case selectors come only from trusted static configuration;
   - query/path selector substitution is rejected;
   - no write route, provider call, external fetch, runtime AI, scheduler, or background work.

4. **Wrangler local proof**
   - pinned `wrangler@4.134.0` as the only new direct dev dependency authorized by Issue #21;
   - local D1 state only;
   - local Access identity simulation through `access.dev`;
   - no Wrangler authentication to an LDW account;
   - no remote binding, deploy, D1 create, or remote execute.

Workers Static Assets are not used in this prototype because the existing standalone Release 0.9 HTML is sufficient. Static asset count and size are therefore zero.

## Accepted schema compatibility

The gate generator reuses the accepted storage schema strings and migration checksums from migration versions 1 and 2. It does not introduce migration 3.

Local Wrangler/D1 proves:

- accepted tables create as STRICT tables;
- JSON functions work;
- invalid JSON payloads fail the accepted CHECK;
- valid JSON payloads above the accepted 65,536-byte payload bound fail the accepted CHECK;
- foreign keys are enabled by the D1 runtime used in the proof;
- the accepted composite ownership foreign key rejects a cross-owner scope insert;
- accepted recommendation revision CHECK constraints fail closed;
- required accepted indexes exist;
- migration versions/checksums match accepted local storage identity;
- deterministic synthetic seed import succeeds;
- canonical payload + SHA-256 integrity mismatches fail closed in the read adapter;
- the 100-record recommendation/measurement/outcome bounds fail rather than truncate;
- the 2,048-observation collection snapshot bound fails rather than truncate.

The D1 collection snapshot query returns collection payload, persisted part/source counts, and bounded observations in one SQL statement. This preserves one-database-snapshot read coherence without introducing a cloud transaction/write abstraction.

## Synthetic data

The local seed is produced through the accepted local repositories first, then exported to D1 SQL. It contains only publication-safe synthetic evidence:

- Alpha and Beta tenants with intentionally overlapping case IDs;
- compatible baseline/current Alpha collections;
- changed evidence;
- one `coverage_unknown` case;
- accepted recommendation history;
- separate rejected recommendation;
- baseline/follow-up measurements;
- one human-declared outcome;
- Beta records used for isolation proof.

No customer or LDW private operational evidence is required.

## Access / authority proof

The Worker trusts identity only through simulated `ctx.access`.

The local gate proves:

- missing `ctx.access` → denied;
- forged `Cf-Access-*` request headers without `ctx.access` → denied;
- wrong Access email → denied;
- exact configured email → allowed;
- request query/path IDs cannot replace trusted tenant/site/scope/case configuration;
- Alpha output does not resolve Beta records even when Beta reuses the same IDs.

No custom JWT verification, password/session/API-key database, or request-derived tenant authority is added.

## Representative gate measurements

The gate runner emits a JSON report under ignored `local-artifacts/cloudflare-gate/gate-report.json`. CI logs also emit the same report as `CLOUDFLARE_GATE_REPORT`.

The report records:

- Worker requests per case;
- D1 query count;
- D1 rows read/written;
- local database bytes after seed;
- rendered HTML bytes;
- local D1/Worker/client timing samples;
- static asset count/bytes;
- projection for 25 case views/day;
- projection for two administrative synthetic refreshes/day.

**Local Wrangler/Miniflare timing is compatibility evidence only and is not production Workers CPU accounting.**

Administrative seed write projection uses deterministic table counts because Wrangler local multi-statement `d1 execute --file --json` may not expose per-row `rows_written` metadata for the import command. Every imported table count is verified after import. Runtime Worker/D1 row metrics use D1 result metadata directly.

## Gate-time Cloudflare references

Verified against official Cloudflare documentation on 2026-09-19:

- Workers Free: 100,000 requests/day, 10 ms CPU/request, 128 MB memory, 50 subrequests/request.
- D1 Free: 5,000,000 rows read/day, 100,000 rows written/day, 10 databases/account, 500 MB/database, 5 GB/account storage, 50 D1 queries per Worker invocation.
- D1 Free read/write/storage limits fail closed when exceeded.
- Workers Static Assets requests are free and unlimited and have no additional asset storage charge.
- Worker-level Access exposes authenticated identity through `ctx.access`; local `wrangler dev` can simulate `ctx.access` without deployment.
- Cloudflare One/Zero Trust onboarding currently requires selecting a plan and entering payment details even for the Free plan. That is an account-level prerequisite and is **not authorized** in this gate-prep workstream.

References:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/setup/

Issue #21 pins `wrangler@4.134.0`. Wrangler `4.135.0` became current after the dispatch; this prototype intentionally keeps the authorized 4.134.0 toolchain rather than changing the gate under review.

## Cost boundary

Actual incremental recurring cost of this local prototype is **$0**. It uses repository CI/included execution and local Wrangler/D1 only.

The measured representative workload is projected against current published Free limits, but that does **not** prove LDW account headroom or a permanent $0 production SLA. Before any remote proof, Product ORCH2/Portfolio must verify the live LDW Cloudflare account, current Workers/D1 usage, Zero Trust state, payment/account prerequisites, and exact remote-resource plan.

## Proposed remote resources — not created

If a later gate authorizes a remote proof, the current proposal remains:

- one Worker;
- one D1 database;
- one Worker-level Access application/policy;
- `workers.dev` or preview URL initially;
- no custom domain;
- no Pages/KV/R2/Queues/Workflows/Durable Objects/Workers AI/Analytics Engine/Hyperdrive.

These are proposals only. This gate creates none of them.

## Retention / deletion proposal

A later remote proof should use synthetic/public-safe data only. If not promoted, delete the proof Worker, Access attachment/policy, D1 database, and proof bindings when the gate concludes. No customer/private data or backup dependency is required for disposable synthetic proof data. D1 Time Travel may provide recovery support but is not the authoritative backup plan.

## Rollback / decommission proposal

If a later remote proof is authorized and then rolled back:

1. disable/delete the proof Worker;
2. remove the proof Worker Access application/policy;
3. delete the proof D1 database;
4. remove proof-only configuration/bindings;
5. verify no custom domain/DNS route was created;
6. verify no paid plan or recurring resource remains;
7. retain only publication-safe GitHub source/evidence.

## Remaining Portfolio gate

Remote proof remains blocked until Portfolio/Product ORCH2 verifies:

1. actual LDW Cloudflare Workers/D1 account headroom;
2. current LDW Zero Trust organization/state;
3. whether Zero Trust Free onboarding/payment prerequisites are already satisfied;
4. exact remote resources and identity policy;
5. measured representative local usage and projected free-tier headroom;
6. retention/deletion;
7. rollback/decommission;
8. explicit $0-envelope verification against the live account.

This guide grants no deployment or Release 1.0 acceptance authority.
