# Authenticated bounded ingestion — Release 0.4

Release 0.4 is a draft candidate built on accepted Release 0.3. It proves one bounded authenticated write path while preserving the accepted tenant-safe persistence model. Product ORCH1 owns independent review and release acceptance; this candidate must remain draft and unmerged until that gate is complete.

## Core security invariant

**Untrusted request data never creates authority.** Request JSON, tenant/provider/record IDs, valid evidence, and non-authentication headers cannot mint a principal, tenant context, or grant.

Three layers implement the proof:

| Layer | Responsibility |
| --- | --- |
| [Authentication](../src/authentication/principal.ts) | An injected `IngestionAuthenticator` consumes only an opaque bearer credential and returns a registered `AuthenticatedPrincipal` or `null`. |
| [Application](../src/ingestion/service.ts) | Strictly validates one bounded persistence part, checks an exact grant, persists it through `EvidenceRepository`, then queries persisted collection progress. It has no HTTP or concrete SQLite knowledge. |
| [Transport](../src/ingestion/http.ts) | Handles one in-process Web `Request` / `Response` route. It parses authentication, media type, bounded bytes, strict UTF-8/JSON, and bounded status responses. It creates no listener and performs no outbound network call. |

There is no production identity provider, login, password store, JWT signing, OAuth flow, session store, API-key database, provider networking, cloud resource, or runtime AI. Tests use only unmistakably synthetic credentials.

## Tenant authority and exact grants

Accepted Release 0.3 keeps the tenant-context issuer in `src/internal/tenant-authority.ts`; the production persistence surface exports only the opaque `TenantContext` type and `requireTenantContext`. Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production module allowed to call `issueTenantContext`.

`issueAuthenticatedPrincipal` is a trusted-adapter-only seam. It validates trusted principal configuration, freezes the principal and its grants, creates the tenant context, and registers principal identity in a private `WeakMap`. Cloned, cast, spread, proxied, or request-created lookalikes do not exist in that registry and therefore have no authority.

Each grant is exact and binds tenant, site, site-scope revision, provider, and provider connection. No wildcard grant exists. The service validates the evidence part first, then checks the validated collection ownership tuple against those exact grants. Neither persistence nor transport can mint tenant authority.

## One-part transport shape

Route: **`POST /v1/evidence/collections`**. No GET/read route exists.

`Idempotency-Key` is a required header and identifies the whole collection request within the existing tenant/site/scope/provider/connection boundary. The strict JSON body represents exactly one bounded persistence part:

```json
{
  "collection": {},
  "part": 1,
  "parts": 2,
  "sources": [],
  "observations": []
}
```

Every part repeats the identical canonical collection record and the same idempotency key. `part` / `parts` identify the bounded part. Canonical `collection.completeness.receivedCount` keeps its Release 0.2/0.3 meaning: the whole collection's evidence count. It is never redefined as the current part's source count.

Persistence bounds remain: at most 64 declared parts, 16 sources per part, 32 observations per part, and the existing 65,536-byte canonical JSON bound. Release 0.4 deliberately applies a narrower **49,152-byte HTTP body limit**; a locally valid larger persistence part can therefore be rejected by this transport proof. The Authorization header is limited to 1,024 characters.

`Content-Length` is only an early check. The reader counts actual streamed bytes and stops/cancels at the hard body limit even when the header is absent or dishonest. UTF-8 decoding is fatal; malformed/incomplete sequences fail. `application/json` is required, with optional UTF-8 charset. `Content-Encoding` may be absent or `identity`; compression is rejected.

## Validation and authorization order

The handler/service deliberately preserve this order:

1. route and method;
2. bounded Authorization parsing;
3. injected authentication;
4. media type and content encoding;
5. bounded streamed body read;
6. strict UTF-8;
7. JSON parsing;
8. strict transport envelope;
9. canonical evidence and part validation;
10. exact-grant authorization;
11. persist exactly one bounded part;
12. query and verify `getCollectionProgress`;
13. return a minimal response.

Authorization never uses an unvalidated raw body string, and persistence never occurs before authorization.

## Progress, replay, and atomicity

A canonical collection may already describe complete source evidence while only some persistence parts have arrived. Release 0.4 therefore never equates canonical completeness with persisted completeness. After `persistCollection`, the application queries `getCollectionProgress`; the persistence result and derived progress must agree or the application fails closed with a bounded internal error.

Success is exactly:

```json
{
  "collectionId": "opaque-id",
  "replayed": false,
  "complete": false
}
```

`complete` is persisted collection progress: all declared parts are stored and persisted source count equals canonical `receivedCount`.

Idempotency is deterministic per collection identity and part. The first successful part returns 201. An exact replay returns 200 with `replayed: true` and the collection's current persisted `complete` state. Changed content for an already persisted part, changed canonical collection/declared part count under the same key, out-of-order opening, or a gap returns typed 409 `conflict`. A valid next ordered part under the same collection idempotency identity is not a conflict.

Atomicity remains exactly the Release 0.3 guarantee: **each part commits or rolls back atomically**. A multipart collection is not one transaction. Failure of a later part does not erase an earlier committed part. Observations in a part may reference only a source carried in that same part; cross-part observation references are a deliberate current limitation and fail validation.

## Bounded response mapping

Every response sets `Content-Type: application/json` and `Cache-Control: no-store`. Authentication failures also set `WWW-Authenticate: Bearer`; wrong methods set `Allow: POST`.

| Status | Stable meaning |
| --- | --- |
| 200 | Exact successful replay. |
| 201 | Newly persisted authorized part. |
| 400 | `invalid_request` transport/envelope error. |
| 401 | `unauthenticated`. |
| 403 | `forbidden` exact-grant failure. |
| 404 | `not_found`. |
| 405 | `method_not_allowed`. |
| 409 | `conflict` for typed idempotency/part-sequence conflict. |
| 413 | `body_too_large`. |
| 415 | `unsupported_media_type`. |
| 422 | `invalid_evidence` canonical/domain/part validation failure. |
| 500 | `internal_error` for bounded unexpected authentication/application/storage/progress failure. |

Errors contain only `{ "error": { "code": "..." } }`. Credentials, grants, evidence bodies, validation dumps, stack traces, SQLite messages, and tenant/provider existence are never echoed. Status mapping uses typed errors, not message-string scraping.

## Untrusted evidence remains inert data

Synthetic tests include instruction-like evidence text. No LLM is called. Evidence cannot alter instructions, mint authority, generate or execute SQL, trigger a URL fetch, create callback behavior, or invoke an external service. The existing no-network tripwire remains active.

## Release boundaries

Release 0.4 changes no evidence contract version and no SQLite schema. Accepted Release 0.3 exact live-schema verification, explicit INSERT column lists, `BEGIN IMMEDIATE` write semantics, deferred read transactions, composite ownership constraints, and same-part source/observation rule remain intact.

Package version is `0.4.0` and remains private. No dependencies are added. No tag or npm publication is created. CI remains least privilege with pinned actions, `contents: read`, no secrets, and no deployment permission. Incremental recurring cost is **$0**.

No provider adapter, WQT/ZeroRank access, production identity provider, customer evidence/deployment, listener, cloud runtime, UI, pricing/billing, runtime AI/BYOK, external remediation, or Release 0.5 work is included.
