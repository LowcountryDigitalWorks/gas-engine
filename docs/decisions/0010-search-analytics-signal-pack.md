# ADR 0010 — Bounded search-analytics adapter and explicit-policy signal pack

- Status: Proposed for Release 0.10 candidate
- Date: 2026-09-29
- Issue: #33

## Context

G.A.S. needs useful search-performance intelligence without becoming a Search Console client, generic SEO suite, rank crawler, or autonomous recommendation engine. Existing accepted contracts already provide tenant-scoped collections, sources, observations, deterministic canonical identity, conservative missingness, and same-stream evidence boundaries.

Google Search Console-style query/page evidence carries source-specific semantics that must not be erased: date windows, filters/dimensions, final/preliminary state, coverage/truncation/anonymization, and absent-row uncertainty. It also contains untrusted property/query/page identifiers that must never mint tenant authority.

## Decision

Release 0.10 will:

1. accept only sanitized `ldw.search-analytics-evidence.v1` minor 0, provider `google-search-console`, search type `web`;
2. require trusted caller configuration for scope, provider connection, expected property, collection timing, and availability;
3. adapt each unique query/page row into one existing canonical source record plus four existing canonical numeric observations;
4. preserve exact query/page strings in an application-local deterministic sidecar linked to canonical source/observation IDs rather than expanding the canonical wire schema;
5. keep exact filter/search-type semantics in the existing collection method/configuration identity;
6. cap source input at 384 rows / 1,536 observations after proving the proposed 500-row target exceeds the accepted byte-aware multipart capacity, and use existing multipart validation with fail-closed overflow;
7. map complete+final evidence to canonical complete coverage and all preliminary/partial/unknown evidence conservatively to partial;
8. compare only exact compatible baseline/current windows;
9. derive only explicit-policy mechanical signals: window deltas, striking-distance candidates, decay candidates, CTR-opportunity candidates, and query→multiple-page overlap candidates;
10. keep derived signals application-local with complete provenance references and deterministic ordering.

## Consequences

### Benefits

- Reuses accepted schemas/persistence and stays within the 2,048-observation snapshot ceiling.
- Keeps provider networking and credentials outside G.A.S.
- Preserves observed zero versus absent/unreturned evidence.
- Makes threshold choices visible, versioned, and caller-controlled.
- Supports later experimentation/page-focus work without prematurely embedding SEO judgments.

### Tradeoffs

- Exact query/page text is carried by the adapter's application-local result rather than a new persisted canonical dimension field.
- Release 0.10 supports one provider/search type only.
- No appeared/disappeared classification is emitted; unmatched rows remain diagnostic counts because source coverage semantics are not strong enough to turn absence into a universal search event.
- The 384-row proof is intentionally small relative to provider-scale exports; it is the verified lower bound after the proposed 500-row target exceeded accepted per-part byte capacity.

## Rejected alternatives

### Add query/page fields to canonical wire dimensions

Rejected for 0.10 because it would broaden the canonical 1.0 contract and generated schemas when existing semantic identity plus application-local mapping is sufficient for the bounded proof.

### Add a GSC OAuth/API client

Rejected. Retrieval, auth, scheduling, and sanitized evidence transport belong upstream to Automation & Agent Operations.

### Reuse generic Release 0.7 appeared/missing semantics directly

Rejected for the signal pack. Search Console row absence can reflect reporting coverage, anonymization, truncation, or provider behavior. Release 0.10 therefore emits deltas only for matched rows and records unmatched counts without an absence-direction signal.

### Hard-code SEO position, CTR, or decay thresholds

Rejected. These are explicit versioned caller policies, not universal truths.

### Persist derived signals

Rejected for 0.10. Signals are reconstructable deterministic application output; persistence would add schema/write-path burden without proving additional value.

## Security and cost

No customer/private evidence, provider credentials, secrets, new dependencies, cloud resources, or paid services are introduced. Incremental recurring cost is $0 under existing included development/CI capacity.

## Acceptance

This ADR remains proposed until Product Orchestrator exact-head review, independent review, required CI/validation, and merge. Development authority cannot mark it accepted.
