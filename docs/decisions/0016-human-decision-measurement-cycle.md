# ADR 0016 — Human Decision & Measurement Cycle Pack

- Status: Accepted
- Release: 0.16
- Issue: #54

## Context

Accepted Release 0.15 provides one deterministic read-only service brief over accepted evidence and human review history. The next useful internal service-delivery seam is the human decision and measurement loop: exact evidence selection, explicit human decision, optional human-authored recommendation, accepted Search Change measurement planning, explicit accepted measurements, human-declared outcome, and one reproducible dossier.

Commodity task management, changelogs, statistical SEO testing, collaboration, dashboards, and auto-generated strategy already exist in maintained products. G.A.S. should not rebuild those surfaces.

## Decision

Release 0.16 is one application-local internal Human Decision & Measurement Cycle layer.

It recomputes Release 0.15 through `assembleServiceBrief(...)`; exact human selections resolve only against that recomputed brief. It reuses accepted Release 0.8 recommendation/measurement/outcome services and accepted Release 0.11 Search Change planning. It adds no parallel recommendation, measurement, outcome, decision-persistence, task, experiment, or annotation system.

Recommendation preparation is read-only. Recommendation creation, lifecycle transitions/revisions, individual measurement recording, and human outcome recording remain explicit operations delegated to accepted services.

The deterministic Decision Cycle Dossier binds all emitted semantic state canonically. HTML/CSS/filesystem paths and presentation formatting are excluded from semantic identity.

## Boundaries

Release 0.16 adds no canonical wire schema, table/migration, dependency, provider network/OAuth/credentials, scheduler/worker, multi-write transaction framework, runtime AI/LLM/embedding, cloud resource, automatic recommendation/rationale/outcome direction, priority/severity/business-impact score, generic correlation/causality, production action/remediation/publishing, customer/private evidence, paid service, Issue #49 implementation, or Release 1.0 implementation.

The human decision and dossier remain application-local and nonpersisted. Existing Release 0.8 recommendation revisions, measurements, and outcomes remain the only write persistence used.

## Status

Accepted through PR #55 after Product review, independent re-review, merge, and successful post-merge Contracts verification.
