# ADR 0009 — Local Cloudflare read-only gate prototype

- **Status:** Gate-prep evidence only; not an accepted Release 1.0 decision
- **Date:** 2026-09-19
- **Accepted base:** Releases 0.1–0.9
- **Authority:** Issue #21
- **Deployment authority:** None

## Context

Release 0.9 proves a compact read-only operator case locally. Before Portfolio can authorize even a bounded remote cloud proof, G.A.S. needs evidence that the accepted read semantics can run on the proposed Cloudflare Worker + D1 + Access architecture without porting cloud writes, weakening tenant authority, adding custom identity storage, or exceeding the intended free-tier proof envelope.

The accepted local repositories expose full read/write interfaces and use interactive SQLite transactions for writes. D1 is SQLite-compatible but does not provide the same interactive transaction model. Porting write/ingestion behavior would therefore be a separate integrity problem and is not needed to test operator cloud value.

## Decision for gate prep

Build only a local prototype that:

- narrows Release 0.9 dependencies to exact read capabilities;
- implements D1 adapters for those reads only;
- reuses accepted schema versions 1 and 2 for compatibility testing;
- renders the accepted Release 0.9 operator HTML through one local Worker;
- trusts identity only after local simulated Cloudflare Access supplies `ctx.access`;
- maps the allowed identity through the existing authenticated-principal/TenantContext seam;
- measures one representative local case;
- uses only synthetic/public-safe data;
- creates no Cloudflare account resource.

The Worker has no runtime write path, no provider/network client, no AI, no scheduler, no general REST API, and no custom authentication database.

## Consequences

- Full accepted repository interfaces remain unchanged.
- No migration 3 or canonical schema version change is introduced.
- D1 snapshot coherence is preserved with a single read statement for collection/progress/observations.
- Existing 100-record review bounds and 2,048-observation snapshot bound remain fail-not-truncate.
- Workers Static Assets are unnecessary for this one-document proof.
- `wrangler@4.134.0` is the only new direct dev dependency under the Issue #21 dispatch.
- Package version remains private `0.9.0`.
- Actual incremental recurring cost of local gate prep remains $0.
- Remote deployment, Release 1.0 acceptance, cloud ingestion/write portability, and live account configuration remain separately gated.

## Rejected alternatives

- port accepted ingestion/write repositories to D1 during gate prep;
- build a custom JWT/session/password/API-key store;
- use Durable Objects to recreate interactive write transactions;
- add Pages, KV, R2, Queues, Workflows, Hyperdrive, Workers AI, or Analytics Engine;
- add Hono, Vite, Vitest, React/Vue/Svelte, an ORM, or a separate Miniflare dependency;
- use request/query IDs as tenant authority;
- deploy to a temporary or permanent Cloudflare account merely to obtain local proof.

## Gate boundary

This ADR records only the architecture of the local prototype. It is not an authorization to deploy the Worker/D1 design, create Zero Trust resources, accept Cloudflare terms, enter payment details, change billing, or merge/accept Release 1.0.
