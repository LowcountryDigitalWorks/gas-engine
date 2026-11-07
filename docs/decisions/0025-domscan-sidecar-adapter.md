# ADR 0025 — DomScan WQT sidecar adapter

- Status: **Accepted — internal offline/local Release 0.25.0** via gas-engine #155 / PR #156
- Date: 2026-11-07
- Issue: #155

## Context

Accepted WQT #58 / PR #59 adds a pure/local DomScan offline sidecar (`ldw.wqt-domscan-sidecar.v1`) for `dns_security` and `agent_readiness`. G.A.S. needs a bounded provider-specific adapter so longitudinal comparison and review linkage can reuse accepted collection/diff architecture without conflating DomScan evidence with SiteOne/Lighthouse normalized WQT or inventing universal site scores.

## Decision

Release 0.25 accepted decision:

1. accept strict UTF-8 JSON bytes for exactly one sidecar artifact per adaptation (`dns_security` with eight ordered checks or `agent_readiness` with twelve sorted signals);
2. bind trusted scope, siteId, origin, endpoint, provider connection, timing envelope, and mapping revision `1.0.0` with endpoint-specific method ids `ldw-domscan-dns-security` and `ldw-domscan-agent-readiness`;
3. preserve source-native classifications with the Product mapping for unknown/inconclusive/not_detected and WebMCP runtime limits;
4. reject cross-endpoint mechanical comparability at the method/schema/connection boundary;
5. keep `agentReadinessScore` out of canonical performance observations;
6. remain pure/local with no WQT package import, provider networking, persistence/migration, or canonical wire schema change.

## Security and cost

No customer data, credentials, new dependencies, provider calls, or cloud spend. Incremental cost remains $0.

## Acceptance

Completed: independent source-clean exact-head **H0/M0/L0** review on PR #156 head `cbf59d18baf762415e2fa9bd0091f4a0ca99cca1`, guarded squash merge at protected `main f2d3098c227e42120af49140267048510f16bb30`, pre-merge Contracts `42354763900` and Security `42354520463` PASS, and post-merge [Contracts `42356580207`](https://github.com/LowcountryDigitalWorks/gas-engine/actions/runs/42356580207) / [Security `42356580669`](https://github.com/LowcountryDigitalWorks/gas-engine/actions/runs/42356580669) PASS. This ADR records accepted source semantics only; future provider networking, public/customer usage, runtime deployment or subsequent semantic releases require separate authorization.
