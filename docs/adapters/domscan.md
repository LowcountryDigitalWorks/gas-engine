# DomScan WQT sidecar adapter — accepted Release 0.25

Status: **Accepted for internal offline/local use**. Issue #155 / [PR #156](https://github.com/LowcountryDigitalWorks/gas-engine/pull/156) guarded-squash merged to main `f2d3098c227e42120af49140267048510f16bb30` after independent exact-head **H0/M0/L0** and successful post-merge [Contracts 42356580207](https://github.com/LowcountryDigitalWorks/gas-engine/actions/runs/42356580207) / [Security 42356580669](https://github.com/LowcountryDigitalWorks/gas-engine/actions/runs/42356580669). The accepted upstream WQT source is `ldw.wqt-domscan-sidecar.v1` from WQT #58 / PR #59. No live provider polling, customer-data ingestion or deployment is authorized.

Issue: [#155](https://github.com/LowcountryDigitalWorks/gas-engine/issues/155)

## Purpose

This adapter consumes one already-sanitized WQT offline DomScan sidecar artifact (`ldw.wqt-domscan-sidecar.v1`). It does not call DomScan, WQT, or DNS. Upstream sensing and WQT normalization remain outside G.A.S.

Supported source contract:

- schema: `ldw.wqt-domscan-sidecar.v1`
- provider: `domscan`
- adapter: `ldw-domscan-sidecar-adapter`
- mapping: `1.0.0`
- input bound: 262 144 bytes (256 KiB; independent of global hash bound)
- endpoints: `dns_security` (8 checks) or `agent_readiness` (12 signals), one artifact per adaptation

The parser is strict and rejects unknown fields, unsupported schema versions, invalid UTF-8/JSON, trusted identity mismatch, malformed origins/timestamps, duplicate or misordered checks/signals, inconsistent SPF/DMARC semantics, and artifacts outside byte bounds.

## Source semantics

DomScan sidecar evidence is **method-bound public-domain DNS and agent-discovery observation**, not SEO rank, security posture, business impact, or execution readiness.

- `present` and `absent` are observed provider-status text only.
- `not_detected`, `unknown`, and `inconclusive` map to canonical unknown with deterministic reasons; they are not observed absence.
- `not_applicable` maps to canonical observation `state: not_applicable` with a deterministic reason (not observed text).
- `webmcp` with `runtime_required` stays unknown, never absent.
- SPF `valid` and DMARC `policy` emit only when classification is consistently `present`.
- Optional `sourceNative.agentReadinessScore` is carried only in source-integrity material; it is **not** a canonical performance or quality observation.
- G.A.S. does not invent a DomScan provider API version; comparability requires matching method, schema, and provider connection. `dns_security` and `agent_readiness` are separate method streams and must not be mechanically cross-compared.

Exact input-byte SHA-256 is returned as a diagnostic only. Semantic collection, source, and observation identities derive from canonical JSON plus trusted configuration.

## Trusted configuration boundary

Trusted caller configuration supplies:

- canonical G.A.S. scope;
- expected opaque WQT `siteId`;
- exact canonical HTTPS `origin`;
- expected `endpoint`;
- provider connection ID;
- `collectedAt` / `receivedAt` envelope strictly after `inputObservedAt`;
- source availability.

Artifact fields cannot mint tenant, site, or connection authority.

## Canonical adaptation

The **accepted 0.25.0 baseline** reuses existing `collection`, `source_record`, `observation`, and `CollectionBatch` contracts and emits one bounded part per endpoint. The independently source-reviewed **0.25.1 patch candidate** extends only the packing/validation implementation below. It is **not yet an accepted or deployed release**.

## Release 0.25.1 patch candidate — byte-safe canonical multi-part evidence

Valid, accepted WQT `agent_readiness` sidecars contain 12 signal rows / 24 canonical observations. Longer but still valid *trusted* provider-connection or availability identifiers can repeat across source/observation metadata and cause the 0.25.0 single-part representation to exceed the canonical **65,536-byte** bound. That is a G.A.S. canonical packing limitation, not defective WQT evidence. This candidate preserves the existing accepted **bit-identical 1-part batch** whenever it fits, including original collection, source, observation and idempotency identities. Otherwise it deterministically splits prepared rows into contiguous groups without changing the source observation meaning, canonical method, adapter version, schema or identity algorithm.

**Existing accepted per-part ingestion bounds remain unchanged:** maximum **64 parts per collection**, maximum **16 sources** and **32 observations per part**, and at most **65,536 canonical UTF-8 JSON bytes per part**. The packer checks each candidate group at the worst-case maximum part-index metadata before forming its stable result. One row that cannot fit fails closed; no row, source, observation, completion state or reference is dropped or silently truncated. A 12-row/24-observation agent sidecar may produce multiple parts, while an 8-row/10-observation DNS sidecar generally fits one part under accepted short configuration; part count is driven by actual validated canonical bytes, **not a promised fixed count**.

Parts use sequential 1-based `part` indices with a common `parts` total, identical collection and idempotency identities, and exact source/observation references. The validator confirms complete contiguous order, uniqueness and bounded canonical structure for every part. Do not treat an independently valid serialized `CollectionBatch` as sufficient to establish a trusted DomScan content claim.

## Original in-process versus detached validation

`adaptDomscanSidecarEvidence(sourceBytes, trustedConfig)` is pure/local and stores a **module-private WeakMap binding** from the exact returned object to a validated clone of the separately trusted configuration and canonical content fingerprints covering root metadata, source-native semantics, every adapted row, and every canonical bounded part. The snapshot binding is **not serialized** into JSON and must not be rebuilt from mutable evidence alone.

Two explicit accepted *candidate* invocation paths (TypeScript-style example, not a new API service):

```ts
const original = adaptDomscanSidecarEvidence(sourceBytes, trustedConfig);
const inProcess = validateDomscanWindow(original); // original returned object: trusted private binding

// When records cross serialization/clone/process boundaries, the WeakMap binding is lost.
const detached = structuredClone(original);
const revalidated = validateDomscanWindow(detached, trustedConfig, sourceBytes);
```

For a **detached/deserialized** result, the validator requires **both** (1) the separately trusted original `DomscanAdapterConfig` and (2) the **exact original source artifact bytes**, supplied by a trusted input path, **not** copied from the untrusted result object. It locally reruns the source adapter to independently reconstruct expected metadata, full rows and every bounded part, and rejects mismatches before returning a validated window. Missing either input, wrong source bytes, config drift, tampering to both row classification and matching observations, reordered/dropped/duplicated parts, conflicting scope/site/method, Proxy/accessors, or invalid canonical data fail closed with `DomscanAdapterError` (typically `invalid_output`). **Providing only a trusted configuration to a detached object is insufficient** and must not be reintroduced for convenience.

Existing one-argument callers that keep the exact result returned directly by the adapter remain compatible. **External/private caller inventory is unverified**: any caller that stores, clones, serializes or transports the result must retain original trusted source bytes and pass them with separately trusted config. Do not assert broad backward compatibility without auditing those consumers. The package is currently private, has no npm `exports`/`main`/`bin` contract, and has no known first-party production callsite depending on config-only detached validation. These observations **do not prove** that no uninspected consumer exists.

## Patch verification and release gate

Existing synthetic tests cover short-ID single part, long-ID multiple parts retaining 24/24 observations, canonical order/size, tamper rejection, direct one-argument trust, detached with config **and original source bytes**, and failure of detached config-only trust. Product acceptance additionally requires exact-head hosted Contracts/Security/CodeQL, 11 canonical schema checks, no new provider/network path, independent author-excluded review and guarded protected squash/postmerge success. This note records a candidate contract, **not acceptance of release 0.25.1**, provider availability, customer production ingestion, or license to make network calls. The canonical schema remains 1.0 and the DomScan adapter mapping stays 1.0.0; only the **private package patch identity** would change to 0.25.1.

Source owner: [G.A.S. #167](https://github.com/LowcountryDigitalWorks/gas-engine/issues/167) / [PR #168](https://github.com/LowcountryDigitalWorks/gas-engine/pull/168). No WQT runtime repin, customer scan, account key or paid credit is required.

