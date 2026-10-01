# ADR 0015 — Unified Operator Intelligence & Service Brief Pack

- Status: Candidate / Not Accepted
- Release: 0.15
- Issue: #51

## Context

Accepted Releases 0.1–0.14 expose deterministic evidence, comparison, human review/outcome history, Search Analytics, Search Change, Page Focus, Discovery Diagnostics, and AI Visibility surfaces. Operators still need one bounded, reproducible service-delivery view that composes those accepted outputs without inventing a universal score, priority, severity, business impact, causal explanation, recommendation, remediation, or action authority.

## Decision

Release 0.15 will implement one application-local Unified Operator Intelligence & Service Brief Pack. It will reuse accepted producer and repository boundaries, preserve exact trusted scope/target identity, and compose fixed module readiness, an unranked attention register, exact-string URL evidence indexing, accepted service-history reads, compact provenance references, one deterministic bounded JSON service brief, one standalone escaped printable HTML renderer, and one synthetic full-pack preview.

Where Release 0.15 owns invocation, original bounded accepted inputs are preferred over caller-created mutable derived report objects.

The service-brief identity binds semantic module/report identities, supplied/not-supplied state, exact trusted scope/target, generated/evaluated time, policy, and explicitly selected recommendation detail IDs. It does not bind rendered HTML/CSS, filesystem paths, prose formatting, or raw provider bytes.

## Boundaries

This candidate adds no canonical wire schema, persistence table/migration, provider/network client, credential/OAuth path, runtime AI/LLM/embedding, cloud resource, scheduler/delivery mechanism, automatic recommendation, priority/severity/materiality/business-impact score, generic cross-module correlation, remediation/action authority, paid dependency, Issue #49 implementation, or Release 1.0 implementation.

Repository-backed reads remain under an already-issued trusted TenantContext. IDs, URLs, scope-shaped data, and module reports cannot mint authority.

## Status

Candidate only. Product review and independent exact-head review remain required before acceptance.


## Implemented candidate surfaces

The candidate exposes application-local Release 0.15 service-brief types, assembleServiceBrief(...), serializeServiceBriefJson(...), and renderServiceBriefHtml(...).

The assembler owns producer invocation for supplied Search Analytics, Search Change, Page Focus, Discovery Diagnostics, and AI Visibility inputs. Repository-backed diff and review-history reads remain tenant-scoped through accepted repositories.

Fixed hard ceilings do not exceed Product limits: 512 attention items, 256 exact URLs, 64 references per URL, 10 detailed recommendation histories, 32 Search Change inputs, and 64 Page-Focus inputs. Candidate JSON is capped at 1,500,000 UTF-8 bytes and HTML at 2,000,000 UTF-8 bytes. Overflow fails explicitly.

Exact URL indexing is literal string grouping only. Co-occurrence is descriptive and does not establish correlation or causality.

The static renderer uses restrictive CSP, no JavaScript or external resources, semantic headings/tables, dynamic-string escaping, focus styling, and print CSS.

## Preview and cost

The candidate adds npm run preview:service-brief to the deterministic check pipeline and writes synthetic JSON/HTML artifacts only under ignored local-artifacts/. It adds no package dependency and targets $0 incremental recurring cash cost.
