# Release 0.18 Managed-Service Run & Evidence Intake Pack

Status: **CANDIDATE / NOT ACCEPTED**

Issue: #65  
Candidate PR: #67  
Package target: `0.18.0`

## Purpose

Release 0.18 turns one already-authorized G.A.S. engagement into a repeatable deterministic service run without adding a scheduler, provider poller, workflow engine, credential store, delivery system, hosted dashboard, or customer SaaS.

```text
trusted evidence / accepted adapters
  -> recompute accepted Release 0.17 OperatorWorkspace
  -> strict source receipts / operational provenance
  -> optional exact prior-run operational continuity
  -> exact accepted Release 0.16 readiness projection
  -> optional accepted Release 0.17 customer report
  -> deterministic file-based package manifest
```

All Release 0.18 models are application-local. No new canonical wire schema or persistence table is introduced.

## WQT minor 3 prerequisite

Release 0.18 deliberately adds WQT v1 minor 3 support in the accepted WQT adapter.

Semantic identities are:

| WQT minor | Adapter mapping | Source schema | Method revision |
| --- | --- | --- | ---: |
| 1 | `1.0.0` | `v1.1` | 1 |
| 2 | `2.0.0` | `v1.2` | 2 |
| 3 | `3.0.0` | `v1.3` | 3 |

Minor 3 reuses the existing generic typed-fact machinery. The skipped-URL count facts are not special-cased in production logic. Future unknown minors still fail closed. Cross-minor Release 0.7 comparison remains an ordinary semantic discontinuity.

`resolveWqtProviderSnapshots(...)` converts accepted WQT adapter output into exact complete SiteOne and Lighthouse snapshots suitable for `compareEvidenceSnapshots(...)`. It verifies multipart count/sequence, collection identity, provider semantics, duplicate sources/observations, source/observation colocation, and exact complete source counts. It performs no persistence or network work.

## Source receipts

A `ServiceRunSourceReceipt` records bounded operational provenance only:

- stable receipt ID and accepted source family;
- `supplied`, `not_supplied`, `unavailable`, or `unsupported`;
- optional sanitized artifact label;
- optional exact SHA-256 and byte count;
- optional source window and collected/received timestamps;
- optional accepted adapter/source-schema identity;
- explicit limitations.

Receipts cannot carry TenantContext or scope authority and cannot override Release 0.15/0.17 readiness. A supplied file does not prove provider truth, and missing evidence never becomes zero.

## ManagedServiceRun

`prepareManagedServiceRun(...)` strict-parses the request and recomputes the current accepted Release 0.17 workspace from the trusted repositories, TenantContext, and original workspace request. A caller-created workspace is never accepted as authority.

The run contains:

- Release 0.18 version/policy and deterministic run ID;
- exact trusted scope/target;
- run period and evaluated time;
- exact workspace, ServiceBrief, and optional DecisionCycle IDs;
- bounded source receipts;
- exact current Release 0.15 readiness;
- compact accepted source-manifest identities;
- exact current Attention IDs;
- exact Release 0.16 readiness/reasons when a decision cycle exists;
- optional exact prior-run operational comparison;
- report state / exact accepted Release 0.17 report ID;
- provenance and explicit limitations.

Run identity binds semantic run state. Filesystem paths and JSON pretty-printing are not run-identity inputs.

## Prior-run operational continuity

A current run may accept zero or one strict `ManagedServiceRunSummary` from a prior Release 0.18 run.

The prior summary is provenance/history only, never authority. Exact scope and target must match the recomputed current workspace.

Comparison is deliberately operational:

- module readiness state;
- source-manifest identity;
- exact Attention IDs;
- decision/readiness state;
- report requested/present state;
- source-receipt state.

Attention uses only:

- `carried_forward`
- `new_in_current`
- `not_present_in_current`

`not_present_in_current` does not mean resolved, fixed, improved, or lower impact. No fuzzy URL/query/prompt matching is performed.

## Follow-up/readiness

Release 0.18 copies accepted Release 0.16 readiness and reasons exactly. It does not create due dates, reminders, tasks, schedules, or a second readiness engine.

## Customer report reuse

If a strict Release 0.17 report request is supplied, Release 0.18 calls the accepted `composeCustomerServiceReport(...)` and renderer. The accepted human-authored narrative, <=3 explicit human focus selection, source binding, CSP/static HTML, and no-ranking rules remain unchanged.

If no report is requested, the run records `not_requested` and creates no client prose.

## Deterministic file package

`composeManagedServiceRunPackage(...)` generates in-memory file payloads:

- `service-run.json` — LDW internal;
- `operator-workspace.json` — LDW internal;
- `operator-workspace.html` — LDW internal;
- optional `customer-report.json`;
- optional `customer-report.html`;
- separately serialized `package-manifest.json`.

A customer report without the optional internal appendix is classified `customer_safe`; a report containing the internal appendix is classified `ldw_internal`.

Each manifest entry records:

- logical role;
- deterministic filename;
- SHA-256 of exact UTF-8 bytes;
- exact UTF-8 byte count;
- explicit classification;
- exact run/workspace/report identity.

No ZIP library or archive format is required. Package byte/count bounds fail closed.

## REPORT-AUTO boundary

Release 0.18 stops at accepted deterministic G.A.S. run/package output.

Future downstream flow is separately governed:

```text
accepted G.A.S. run/package output
  -> separately governed deterministic REPORT-AUTO source adapter
  -> ldw.client-report-evidence.v1
```

Release 0.18 does not implement report delivery, SuiteDash delivery, AI narrative generation, or the private Issue #63 `ldw.gas-wqt-semantic-change.v1` history/runtime work.

## Preview

`npm run preview:service-run` uses public-safe `example.test` material only and demonstrates:

- WQT minor-3 adaptation;
- exact SiteOne/Lighthouse snapshot reconstruction;
- accepted Release 0.7 comparison;
- authoritative Release 0.17 workspace and human decision preparation;
- supplied/unavailable/not-supplied receipt states;
- prior/current exact operational comparison;
- exact Release 0.16 readiness;
- human-selected Release 0.17 customer report;
- deterministic service-run files and package manifest.

The preview is included in `npm run check`.

## Boundaries

Candidate Release 0.18 adds no new database/table/migration, canonical schema, provider network or credential path, server/listener, scheduler/worker, cloud resource, report delivery, runtime AI, new runtime dependency, paid service, private WQT runtime, Issue #49/#56 implementation, Release 0.19, or Release 1.0.
