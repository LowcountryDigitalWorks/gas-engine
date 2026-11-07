# ADR 0025 — DomScan WQT sidecar adapter

- Status: **draft candidate via gas-engine #155** (not accepted)
- Date: 2026-11-07
- Issue: #155

## Context

Accepted WQT #58 / PR #59 adds a pure/local DomScan offline sidecar (`ldw.wqt-domscan-sidecar.v1`) for `dns_security` and `agent_readiness`. G.A.S. needs a bounded provider-specific adapter so longitudinal comparison and review linkage can reuse accepted collection/diff architecture without conflating DomScan evidence with SiteOne/Lighthouse normalized WQT or inventing universal site scores.

## Decision

Release 0.25 draft candidate:

1. accept strict UTF-8 JSON bytes for exactly one sidecar artifact per adaptation (`dns_security` with eight ordered checks or `agent_readiness` with twelve sorted signals);
2. bind trusted scope, siteId, origin, endpoint, provider connection, timing envelope, and mapping revision `1.0.0` with endpoint-specific method ids `ldw-domscan-dns-security` and `ldw-domscan-agent-readiness`;
3. preserve source-native classifications with the Product mapping for unknown/inconclusive/not_detected and WebMCP runtime limits;
4. reject cross-endpoint mechanical comparability at the method/schema/connection boundary;
5. keep `agentReadinessScore` out of canonical performance observations;
6. remain pure/local with no WQT package import, provider networking, persistence/migration, or canonical wire schema change.

## Security and cost

No customer data, credentials, new dependencies, provider calls, or cloud spend. Incremental cost remains $0.

## Acceptance

Pending: Product exact-head review, hosted Contracts/Security PASS, independence-clean review, guarded merge, and post-merge validation. No merge authority is granted by this draft ADR.
