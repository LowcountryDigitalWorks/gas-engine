# DomScan WQT sidecar adapter — Release 0.25 draft candidate

Status: **Release 0.25 draft candidate. Not accepted until Product review, independent review, merge, and post-merge verification.**

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

The adapter reuses existing `collection`, `source_record`, `observation`, and `CollectionBatch` contracts with one bounded part per endpoint under accepted 64×16×32 / 65KiB packing limits.
