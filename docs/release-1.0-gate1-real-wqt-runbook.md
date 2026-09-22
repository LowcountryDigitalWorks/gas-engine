# Release 1.0 Gate 1 — real LDW WQT value-proof runbook

**Status:** Portfolio-authorized Gate 1 mechanism only. This runbook does not declare Release 1.0 accepted.

Issue #25 defines Release 1.0 Gate 1 as the first real end-to-end LDW evidence + value proof. The operator runner in `scripts/gate1-wqt-runner.ts` is deliberately local glue around accepted Releases 0.5–0.9. It does not download artifacts, dispatch WQT, run SiteOne/Lighthouse, access GitHub, fetch URLs, call provider APIs, deploy cloud resources, schedule work, or create action/remediation authority.

Real WQT evidence for `lowcountrydigitalworks.com` belongs only in an owner-controlled local working directory. Do not copy real artifacts, local proof databases, metadata ledgers, recommendation files, measurements, outcomes, or rendered real reports into this public repository.

## What the runner owns

The runner supports these explicit commands:

- `init` — create one new local SQLite proof database and private metadata ledger.
- `import-wqt` — read one already-normalized WQT file, verify operator-supplied comparability metadata, adapt it through `adaptWqtNormalizedEvidence(...)`, and persist the ordinary accepted collection parts.
- `list` — list bounded artifact/toolchain identity plus persisted collection IDs/progress without printing evidence payloads.
- `compare` — run accepted Release 0.7 persisted comparison for an explicit provider-specific baseline/current collection pair and print the summary + review-attention entries.
- `recommend-create` — call accepted `createHumanRecommendation(...)`.
- `recommend-revise` — call accepted `reviseHumanRecommendation(...)`.
- `recommend-transition` — call accepted `transitionHumanRecommendation(...)`.
- `measure` — call accepted `recordMeasurement(...)`.
- `outcome` — call accepted `recordHumanOutcome(...)`.
- `review-show` — show bounded recommendation revision/measurement/outcome identity for reconstruction.
- `render-case` — call accepted Release 0.9 assembly + deterministic HTML rendering for explicit collection/recommendation IDs.

The runner does not implement a second evidence store or review ledger. Evidence and human-review records remain in the accepted local SQLite repositories.

## Build once

From a clean repository checkout on the accepted Gate 1 candidate:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
```

All examples below use:

```sh
npm run gate1:wqt -- <command> ...
```

No command has a default database, ledger, tenant, site, timing, artifact, or report path.

## Owner-local working directory

Create an owner-controlled directory outside the public repository, for example:

```text
<OWNER_WORKDIR>/
  authority.json
  gate1.sqlite
  gate1-ledger.json
  baseline/
    normalized/website-quality.json
    import.json
  current/
    normalized/website-quality.json
    import.json
  remeasurement/
    normalized/website-quality.json
    import.json
  review/
    recommendation-v1.json
    recommendation-v2.json
    measurement.json
    outcome.json
  reports/
```

The runner refuses to overwrite an existing database during `init` and refuses to overwrite an existing rendered report.

## Trusted authority configuration

Create `authority.json` locally. Every field is trusted operator configuration; none is inferred from WQT evidence.

Publication-safe shape:

```json
{
  "principalId": "ldw-gas-gate1-operator",
  "scope": {
    "tenantId": "<TRUSTED_TENANT_ID>",
    "siteId": "<TRUSTED_SITE_ID>",
    "siteScopeRevisionId": "<TRUSTED_SCOPE_REVISION_ID>"
  },
  "siteLabel": "Lowcountry Digital Works",
  "expectedWqtSiteId": "lowcountrydigitalworks",
  "expectedTargetOrigin": "https://lowcountrydigitalworks.com",
  "providerConnectionIds": {
    "siteone": "<TRUSTED_SITEONE_CONNECTION_ID>",
    "lighthouse": "<TRUSTED_LIGHTHOUSE_CONNECTION_ID>"
  }
}
```

The local runner maps this trusted configuration through the existing authenticated-principal authority seam to obtain the opaque `TenantContext`. WQT fields never mint tenant/site/scope/provider-connection authority.

## Initialize the proof database

The parent directory must already exist.

```sh
npm run gate1:wqt -- init \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json
```

Run `init` exactly once for the controlled Gate 1 proof database. A second `init` against the same paths fails closed rather than replacing local state.

## Per-artifact comparability metadata

For each of baseline/current/re-measurement, create a separate local `import.json`.

All values must come from the exact collected WQT run or explicit trusted operator timing. Do not silently invent timestamps.

```json
{
  "wqtCommitSha": "<40_HEX_WQT_COMMIT>",
  "actionsRunId": "<DECIMAL_RUN_ID_AS_STRING>",
  "artifactName": "<ARTIFACT_NAME>",
  "artifactArchiveSha256": "<OPTIONAL_64_HEX_ARCHIVE_DIGEST>",
  "normalizedFileIdentity": "normalized/website-quality.json",
  "normalizedSha256": "<64_HEX_EXACT_NORMALIZED_FILE_DIGEST>",
  "schemaVersion": "ldw.website-quality.v1",
  "schemaMinorVersion": 1,
  "siteOneVersion": "<SITEONE_VERSION>",
  "lighthouseVersion": "<LIGHTHOUSE_VERSION>",
  "timing": {
    "observedAt": "<CANONICAL_UTC_TIMESTAMP>",
    "startedAt": "<CANONICAL_UTC_TIMESTAMP>",
    "endedAt": "<CANONICAL_UTC_TIMESTAMP>",
    "collectedAt": "<CANONICAL_UTC_TIMESTAMP>",
    "receivedAt": "<CANONICAL_UTC_TIMESTAMP>"
  },
  "availability": {
    "siteone": {
      "state": "available",
      "reference": "<OWNER_LOCAL_SOURCE_REFERENCE>"
    },
    "lighthouse": {
      "state": "available",
      "reference": "<OWNER_LOCAL_SOURCE_REFERENCE>"
    }
  }
}
```

The import command verifies:

- exact normalized bytes against `normalizedSha256`;
- accepted WQT schema/minor through the existing adapter;
- WQT site/target against trusted authority configuration;
- SiteOne/Lighthouse versions against the normalized artifact;
- accepted WQT evidence-only/gate-policy semantics;
- flattened/nested source reconciliation and all existing adapter bounds.

The private metadata ledger records, for each import:

- WQT commit;
- Actions run ID;
- artifact name;
- optional archive digest;
- normalized file identity + exact SHA-256;
- WQT schema/minor;
- SiteOne version and normalized `executedAt`;
- Lighthouse version, normalized `fetchTime`, and user agent;
- trusted canonical timing;
- trusted source availability;
- resulting SiteOne/Lighthouse collection IDs;
- provider-specific persisted source and observation counts.

It does **not** copy normalized evidence payloads into the ledger.

## Import each normalized artifact

Example baseline:

```sh
npm run gate1:wqt -- import-wqt \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --artifact <OWNER_WORKDIR>/baseline/normalized/website-quality.json \
  --metadata <OWNER_WORKDIR>/baseline/import.json
```

Repeat only when Product ORCH2 routes the already-collected current and re-measurement artifacts.

Exact replay of the same artifact/metadata is accepted idempotently. A reused normalized digest with conflicting metadata or collection identity fails closed.

## Check collection identity and comparability metadata

```sh
npm run gate1:wqt -- list \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json
```

Before comparing artifacts, manually verify the recorded sequence is materially comparable:

- same intended WQT commit, preferably exact;
- same schema/minor;
- materially equivalent SiteOne and Lighthouse versions/toolchain;
- same trusted scope and provider connections;
- monotonically ordered trusted collection timing.

If normalization/target/scanner/toolchain drift could masquerade as a website change, stop and return to Product ORCH2 or regenerate a comparable sequence under one pinned toolchain.

SiteOne and Lighthouse are separate accepted semantic streams. Compare SiteOne baseline/current IDs to each other and Lighthouse baseline/current IDs to each other. Do not compare across providers.

## Compare baseline/current

```sh
npm run gate1:wqt -- compare \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --baseline <BASELINE_COLLECTION_ID> \
  --current <CURRENT_COLLECTION_ID>
```

Output includes:

- collection pair;
- accepted Release 0.7 summary counts;
- only non-unchanged review-attention entries;
- baseline/current observation IDs where present;
- mechanical values/deltas/reasons.

It does not infer improvement, severity, materiality, business impact, priority, or recommended action.

Record the real experiment's M2–M5 observations manually from these outputs and the private metadata ledger. Development synthetic tests do not declare the real mechanism gate passed.

## Human recommendation lifecycle

Use a changed/attention observation ID selected by Eddie. Create a canonical Release 0.8 recommendation JSON locally.

Initial recommendation requirements remain unchanged:

- `schemaVersion: "1.0"`;
- `authorityClass: "internal_review"`;
- `priority.level: "unassessed"`;
- observation evidence only;
- `revision: 1`;
- `lifecycle: "proposed"`;
- explicit canonical timestamps.

Create:

```sh
npm run gate1:wqt -- recommend-create \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --input <OWNER_WORKDIR>/review/recommendation-v1.json
```

For a material human-authored content revision, prepare the complete next canonical recommendation with the same ID/scope/lifecycle/createdAt, incremented revision, updated timestamp, and changed human-authored content:

```sh
npm run gate1:wqt -- recommend-revise \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --input <OWNER_WORKDIR>/review/recommendation-v2.json \
  --expected-revision <CURRENT_REVISION>
```

Lifecycle transitions remain explicit:

```sh
npm run gate1:wqt -- recommend-transition \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --recommendation <RECOMMENDATION_ID> \
  --expected-revision <CURRENT_REVISION> \
  --lifecycle in_review \
  --updated-at <CANONICAL_UTC_TIMESTAMP>
```

Use only transitions accepted by Release 0.8. Stale revisions fail closed. Recommendation acceptance does not create execution authority.

## Record a selected measurement

Prepare one canonical measurement JSON locally using the exact selected persisted observation/cohort/value. The accepted service rejects fabricated measurement values.

```sh
npm run gate1:wqt -- measure \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --input <OWNER_WORKDIR>/review/measurement.json \
  --cohort-observation <CANONICAL_OBSERVATION_ID> \
  --recommendation <RECOMMENDATION_ID>
```

For the real Gate 1 lifecycle, the measurement/outcome choice remains Eddie's human judgment. Do not infer an outcome from numeric movement.

## Record a human-declared outcome

Prepare a canonical outcome JSON locally with the intended recommendation ID and measurement references as appropriate.

```sh
npm run gate1:wqt -- outcome \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --input <OWNER_WORKDIR>/review/outcome.json
```

Release 0.8 still permits only `none` or `technical_verification` attribution at the application seam. `inconclusive`, `not_due`, and `not_measured` remain valid explicit human states when appropriate.

## Reconstruct review history

```sh
npm run gate1:wqt -- review-show \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --recommendation <RECOMMENDATION_ID>
```

Use this output for M6/M7 reconstruction without mutating history.

## Render the accepted Release 0.9 case

```sh
npm run gate1:wqt -- render-case \
  --db <OWNER_WORKDIR>/gate1.sqlite \
  --ledger <OWNER_WORKDIR>/gate1-ledger.json \
  --config <OWNER_WORKDIR>/authority.json \
  --baseline <BASELINE_COLLECTION_ID> \
  --current <CURRENT_COLLECTION_ID> \
  --recommendation <RECOMMENDATION_ID> \
  --output <OWNER_WORKDIR>/reports/<EXPLICIT_REPORT_NAME>.html
```

The output is the existing deterministic standalone Release 0.9 HTML. The runner refuses to replace an existing report path.

## Three-artifact experiment control

Development only provides the mechanism.

Do **not**:

- collect artifact #2 merely because the runner exists;
- dispatch WQT from G.A.S.;
- make a production website change under G.A.S. authority;
- fabricate a true-positive;
- use a prospect/customer site;
- introduce ZeroRank;
- open provider/vendor surfaces automatically.

A known true-positive must be an independently useful ordinary `lowcountrydigitalworks.com` maintenance change, separately authorized by the Website owning workstream. If no legitimate maintenance change exists during the gate window, return BLOCKED rather than manufacturing one.

## Manual value measurements

Keep L1–L3 and U1–U4 manual at n=1:

- L1 — operator minutes using G.A.S. vs manual WQT reconciliation.
- L2 — raw artifacts/vendor surfaces manually opened.
- L3 — manual copy/paste steps.
- U1 — did G.A.S. surface anything Eddie would otherwise miss?
- U2 — would Eddie want this workflow/output for a paying client?
- U3 — what was noise?
- U4 — what was missing?

Do not automate these measurements away.

## Gate boundaries

This mechanism does not itself declare M1–M8 or U2 passed.

Release 1.0 Gate 1 acceptance still requires the real three-artifact owner-controlled experiment and Product ORCH2/Portfolio review.

No merge, cloud deployment, new sensor, customer evidence, or Gate 2 work is authorized by this runbook.
