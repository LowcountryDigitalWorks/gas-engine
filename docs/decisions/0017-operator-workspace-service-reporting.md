# ADR 0017 — Local Operator Workspace and Customer-Safe Reporting

Status: **Accepted**

Date: 2026-10-01  
Issue: #60  
Candidate PR: #62

## Context

Accepted Releases 0.15 and 0.16 provide deterministic service-brief and human decision/measurement semantics. LDW now needs one usable internal workbench and a repeatable customer-safe report flow without adding a hosted dashboard, UI framework, new persistence tier, or reporting subscription.

## Decision

Build Release 0.17 as a local-first browser workbench over accepted engine services.

The authoritative boundary is Node-side:

1. recompute accepted Release 0.15 state;
2. optionally recompute accepted Release 0.16 state;
3. emit a deterministic OperatorWorkspace;
4. let the browser filter/select and download bounded request JSON;
5. treat downloaded JSON as untrusted;
6. recompute authoritative state and verify source identities before any write;
7. delegate only to accepted Release 0.16 / Release 0.8 write services;
8. regenerate authoritative workspace/report state.

Customer reporting is a separate deterministic model driven by explicit human commentary and one to three human-selected focus items. Selection is not automatic G.A.S. priority.

Use existing Node 24, TypeScript, Zod, canonical hashing, semantic HTML, plain CSS, and bounded browser-native JavaScript only.

## Browser trust and security

The browser cannot mint TenantContext, authorize scope, rewrite canonical observations, write SQLite, or bypass accepted expected-revision/current-cycle checks.

The generated workbench denies network access through CSP and contains no provider call, remote asset, authoritative browser storage, unsafe dynamic HTML, runtime AI, or direct repository mutation. Local Blob download is used only to hand request JSON back to an authoritative local Node host.

## Persistence

No new canonical wire schema, database table, migration, report store, service-run store, or changelog store is added. Existing Release 0.8 review-ledger persistence remains the only durable storage touched by accepted delegated writes.

## Consequences

Benefits:

- usable internal workflow without a new platform dependency;
- browser tampering and stale state fail before durable write;
- accepted Release 0.15/0.16 semantics remain authoritative;
- customer-safe output is separated from deeper internal provenance;
- incremental recurring cash remains $0 for this bounded candidate.

Constraints:

- a trusted local Node host is required to apply requests;
- there is no hosted portal, login, scheduled delivery, or customer self-service;
- report/service-run state is not newly persisted;
- multi-site portfolio UX, deployment, and customer-facing product architecture remain future gates.

## Rejected alternatives

Release 0.17 does not adopt a dashboard/reporting SaaS, React/Vue/Svelte/Next/Vite, charting/component framework, server/listener, direct browser storage/write path, AI-written reporting, automatic priority ranking, PDF dependency, or new persistence.

## Acceptance

This ADR remains proposed until Product exact-head review, any authorized correction, final independent exact-head review, protected-main merge, and post-merge verification are complete.
