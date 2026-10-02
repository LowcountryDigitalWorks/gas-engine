# Release 0.17 Operator Workspace & Service Reporting UX Pack

Status: **Accepted**

Issue: #60  
Candidate PR: #62  
Package target: `0.17.0`

## Purpose

Release 0.17 is the first cohesive internal LDW operator workbench over the accepted Release 0.15 service brief and Release 0.16 human decision/measurement cycle. It is a local-first browser experience, not a hosted dashboard or customer portal.

The authoritative flow is:

```text
trusted local host + accepted repositories + TenantContext
  -> recompute Release 0.15 ServiceBrief
  -> optionally recompute Release 0.16 DecisionCycleDossier
  -> deterministic OperatorWorkspace snapshot
  -> self-contained local browser workbench
  -> bounded downloaded action/report request
  -> authoritative Node-side strict parse + source drift checks
  -> accepted Release 0.16 / Release 0.8 service call
  -> regenerated authoritative workspace/report
```

The browser is an untrusted convenience layer. Its fields, IDs, downloaded JSON, filters, checkboxes, and human-entered text do not create tenant/site/scope authority or canonical evidence.

## Candidate surfaces

- `prepareOperatorWorkspace(...)` — recomputes accepted Release 0.15 and optional Release 0.16 state and emits one bounded deterministic workspace.
- `parseOperatorWorkspaceRequest(...)` / `serializeOperatorWorkspaceJson(...)`.
- `renderOperatorWorkspaceHtml(...)` — one self-contained browser workbench with Overview, Evidence/readiness, Attention, Decision cycle, History/timeline, and Reports.
- `createOperatorActionArtifact(...)` / `parseOperatorActionArtifact(...)` / `applyOperatorWorkspaceAction(...)` — strict application-local browser-to-Node request seam.
- `composeCustomerServiceReport(...)` / `serializeCustomerServiceReportJson(...)` — deterministic customer-safe report composed only after authoritative workspace recomputation.
- `renderCustomerServiceReportHtml(...)` — static no-JavaScript printable customer report.
- `executeOperatorWorkspaceCommand(...)` — injected local operator entrypoint for a trusted host that already owns repositories and TenantContext.
- `npm run preview:workspace` — full public-safe `example.test` proof.

These are application-local Release 0.17 types. They are not new canonical wire contracts and are not added to exported wire schemas.

## Workspace identity and source binding

The workspace ID uses accepted canonical hashing over a bounded semantic identity material that includes:

- Release 0.17/projection version;
- exact trusted scope and target;
- generated/evaluated timestamps;
- explicit workspace policy;
- authoritative Release 0.15 ServiceBrief ID;
- optional authoritative Release 0.16 dossier ID;
- compact emitted projection counts.

Release 0.15/0.16 IDs already bind their accepted semantic state. HTML/CSS/browser-script bytes, UI filter state, checkbox order, and filesystem paths do not define workspace identity.

Every durable browser action binds:

- workspace ID;
- current ServiceBrief ID;
- current dossier ID when applicable;
- stable action ID and timestamp;
- one strict allowed action.

Node recomputes the workspace before any write. Stale workspace, brief, dossier, tenant/scope, expected revision, or current measurement identity fails before accepted persistence.

## Durable action boundary

Release 0.17 does not implement a new decision/recommendation/measurement/outcome engine.

Allowed browser request/action families include one non-durable preparation seam plus accepted durable services:

- prepare/update human decision -> strict `prepare_decision` artifact -> `prepareOperatorWorkspaceDecision(...)` -> accepted `prepareDecisionCycle(...)` -> regenerated workspace + exact next trusted-host `OperatorWorkspaceRequest`;
- commit prepared recommendation -> `commitDecisionRecommendation(...)`;
- transition recommendation -> `transitionDecisionRecommendation(...)`;
- revise recommendation -> `reviseDecisionRecommendation(...)`;
- record one exact prepared baseline/follow-up -> `commitDecisionMeasurement(...)`;
- record one human outcome -> `commitDecisionOutcome(...)`.

Decision preparation copies the exact checked Release 0.15 Attention IDs plus bounded human decision fields into an untrusted artifact. Node recomputes current state, verifies workspace/brief/dossier identity, validates current attention membership, reuses the accepted Release 0.16 parser/schemas, preserves existing optional recommendation/search-plan input when safe, and performs no Release 0.8 write. The trusted host receives both the regenerated workspace and the exact next workspace request so later actions need no hand-authored decisionCycleInput.

For measurement commits the downloaded request must name the exact current Release 0.11 prepared measurement ID for the selected role. The browser cannot supply or rewrite canonical measurement observations.

Recommendation transitions/revisions retain Release 0.8 expected-current-revision enforcement. Outcome writes retain all accepted Release 0.16 plan/no-plan association guards and current-cycle measurement isolation.

## Browser security model

The generated workbench is self-contained and uses:

- escaped pre-rendered semantic content;
- safe `textContent`, attributes, hidden state, and class toggling;
- a deterministic SHA-256 CSP hash for the single bounded inline script;
- `default-src 'none'`;
- `connect-src 'none'`;
- `form-action 'none'`;
- no remote images, fonts, styles, or scripts;
- no `fetch`, XHR, WebSocket, EventSource, or service worker;
- no authoritative localStorage/sessionStorage/IndexedDB/cookies;
- no `eval`, Function constructor, or dynamic untrusted `innerHTML`;
- local `Blob` download only for action/report request JSON;
- browser print as a convenience only.

UI filters are presentation-only and never mutate the underlying workspace snapshot.

## Operator navigation

1. **Overview** — exact site/scope context, source readiness, source periods/freshness, coverage context, deterministic evidence-state counts, bounded counts, and limitations. No universal health/business score.
2. **Evidence / readiness** — bounded provider/module/state/text filtering over accepted Release 0.15 evidence/attention projection, preserving exact references and module-level accepted source-provider context.
3. **Attention** — accepted unranked attention register with explicit human selection controls plus bounded decision ID/disposition/summary/recordedAt fields and a **Prepare / update human decision request** control. Selection is not G.A.S. priority; the downloaded request remains untrusted until Node-side recomputation.
4. **Decision cycle** — accepted Release 0.16 human decision, recommendation state/history, Search Change plan, exact current-cycle measurements, readiness, and human outcome.
5. **History / timeline** — reverse-chronological projection of accepted immutable history; no second changelog table.
6. **Reports** — human fields plus one-to-three explicit customer focus selections and optional internal appendix request.

## Customer-safe report

Primary report content is deterministic and human-controlled:

- context/period;
- human-authored executive summary;
- customer-safe readiness/limitations;
- human-authored observed changes;
- one to three human-selected focus items;
- decision/recommendation status;
- measurement/follow-up state;
- recorded human outcome;
- next-review/not-yet-measurable text;
- provider/source method notes.

The customer body does not expose workspace/service-brief/dossier/attention IDs by default. An optional clearly marked LDW internal appendix may contain those provenance identifiers and is visually separated from the customer-safe body.

The report does not auto-rank findings, create priority/severity/business-impact scores, infer causality, or generate prose with AI. Browser collection of observed-change lines fails closed above 12 non-empty lines; it never truncates human-authored input. Node-side strict max(12) validation remains the authoritative backstop.

## Bounds

- workspace JSON: <= 2,000,000 UTF-8 bytes;
- workspace HTML: <= 3,000,000 UTF-8 bytes;
- action artifact: <= 256,000 UTF-8 bytes;
- report request: <= 256,000 UTF-8 bytes;
- customer report JSON: <= 750,000 UTF-8 bytes;
- customer report HTML: <= 1,500,000 UTF-8 bytes;
- customer primary focus selection: 1–3 unique accepted attention IDs.

Overflow fails closed.

## Local operator entrypoint

`executeOperatorWorkspaceCommand(...)` is deliberately dependency-injected. The trusted local host supplies:

- `EvidenceRepository`;
- `ReviewLedgerRepository`;
- already-issued trusted `TenantContext`.

It supports:

- workspace generation;
- non-durable human-decision preparation with returned trusted-host continuation state;
- application of one downloaded durable action artifact;
- authoritative workspace regeneration after accepted write;
- customer-report generation from one strict report request.

It does not prompt for credentials, authenticate users, issue TenantContext, open a server/listener, or contact providers.

## Persistence / deployment boundary

Release 0.17 candidate adds:

- no database/table/migration;
- no canonical wire schema;
- no report/service-run persistence;
- no server/listener;
- no auth/session runtime;
- no cloud resource;
- no provider network path;
- no OAuth/API-key handling;
- no scheduler/worker;
- no email/report-delivery service;
- no customer portal;
- no runtime AI;
- no paid service or new dependency.

Existing Release 0.8 review-ledger persistence remains the sole durable storage used by the accepted write services.

## Preview

`npm run preview:workspace` uses only synthetic `example.test` data and emits under `local-artifacts/`:

- `release-0.17-workspace-preview.json`;
- `release-0.17-workspace-preview.html`;
- `release-0.17-action-preview.json`;
- `release-0.17-customer-report-preview.json`;
- `release-0.17-customer-report-preview.html`.

The preview begins from a workspace with no decision cycle, exercises the Release 0.17 human-decision preparation request/continuation seam, then continues through recommendation creation/lifecycle, exact Release 0.11 baseline/follow-up commits, human outcome recording, authoritative workspace regeneration, and human-selected customer reporting.

## Candidate limitations

Release 0.17 is internal operator tooling, not a hosted product. Browser-generated requests require an authoritative trusted Node host to apply them. There is no durable service-run/report store, scheduled delivery, customer login, generic report designer, automatic priority, provider sensing, production remediation, or customer self-service.

Issue #49, Issue #56, Release 0.18, and Release 1.0 remain separate and are not implemented by this candidate.
