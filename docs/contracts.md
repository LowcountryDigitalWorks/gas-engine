# Canonical contracts — Release 0.2

This local library implements the [accepted evidence-core architecture](decisions/0001-evidence-core.md). It validates records and provides bounded deterministic identity/comparison helpers. There is no provider access, ingestion, persistence, server, authentication, priority engine, execution adapter, or deployment. Synthetic contract scope checks do not replace Release 0.3 adversarial persistence/isolation tests.

## Entry points and contract inventory

Use `parseContract(name, value)` from [src/domain/index.ts](../src/domain/index.ts). TypeScript types are inferred from the actual validators as `Contract<'observation'>`, for example. No parallel handwritten type hierarchy or branded-ID framework is needed.

| Registry name | Preserved meaning |
| --- | --- |
| `sourceRecord` | Tenant/site/scope/provider/connection/source-record identity, integrity, and availability references; no raw provider payload. |
| `provenance` | Source identity, adapter/version, source schema/version, run, source period, collection/receipt times, optional source timezone, completeness, integrity, normalization/version, and availability/retention state. |
| `observationValue` | Discriminated observed/unknown/unavailable/not_collected/not_applicable union. |
| `collection` | Final collection snapshot: complete, partial, unavailable, or failed, with counts, scope, method, source period, and lifecycle timestamps. No running-job engine. |
| `cohort` | Identity/revision and explicit comparison context: scope, subject, metric meaning/unit/value type, optional typed dimensions, collection method/configuration, and time-window rules. |
| `observation` | Observation ID and value with embedded cohort/context and provenance; scope/subject/metric/dimensions live in `cohort.context`, and source/run/time/normalization/completeness live in `provenance`. No inference or recommendation logic. |
| `inference` | Separate supporting and contradicting scoped observations, method/version, rationale, qualitative confidence basis or explicit uncertainty, and creation time. Confidence is not statistical probability. |
| `recommendation` | Scoped evidence/inference links, rationale, bounded priority label/basis, authority class, lifecycle, revision, and creation/update times. |
| `action` | A distinct record linking recommendation revision and plan revision, execution state, separate authority reference, optional external receipt, execution timestamps, and verification state. |
| `measurement` | Baseline/follow-up link, cohort snapshot, due/observed windows, observed values plus scoped references, declared comparability, and methodology/version. |
| `outcome` | Improved, regressed, unchanged, inconclusive, not_due, or not_measured assessment, with attribution strength preserved independently. |

IDs are validated opaque strings. Their domain names are listed in [primitives.ts](../src/contracts/primitives.ts). Provider/source IDs are opaque references, not URLs or payloads; later adapters must preserve an unambiguous mapping when source IDs require encoding. IDs, hashes, scope fields, and approval references do not establish authorization or prove that referenced records exist. Future application/persistence code must obtain trusted tenant context, authorize operations, and resolve references within that scope.

## Zero, missingness, and completeness

Observed numeric zero is exactly `{ "state": "observed", "value": { "type": "number", "value": 0 } }`. Text and boolean observations are typed separately. Missing states contain a state and meaningful bounded `reason`, with no `value` allowed. Null, undefined, empty/whitespace-only text, omitted values, numeric strings for numeric metrics, and mixed union shapes are rejected. Callers can exhaustively discriminate the state and value type.

`complete` requires both `expectedCount` and `receivedCount`, and the application check requires equality. Complete-empty is explicitly 0/0; it means the declared source collection completed, not that every possible real-world condition is absent. `partial` preserves received count and reason; when expected count is known it must exceed received count. `unavailable` has zero received records plus a reason, and `failed` preserves any received count plus a reason. A partial/failed run can retain evidence without being mistaken for a complete run. An observed value requires a received source record. These are producer assertions with retained provenance, not independently verified provider truth.

## Versions and wire/domain validation

All record/envelope contracts accept exactly `schemaVersion: "1.0"`. This is the contract version, independent of package/release `0.2.0` and provider/source/adapter/normalization versions. Nested envelopes are checked too. The value union and shared primitives are versioned by their enclosing contract and exported schema identity.

Unknown fields and unsupported versions fail closed; there is no silent stripping, coercion, defaulting, or fallback. Even a future minor such as `1.1` is rejected until intentionally supported. A compatible addition requires an explicit versioned validator, export, and tests that preserve existing 1.0 interpretation. Unsupported major versions never fall back to 1.0. No migration infrastructure exists.

[wire.ts](../src/contracts/wire.ts) and [primitives.ts](../src/contracts/primitives.ts) contain portable Zod schemas without transforms or custom refinements. Zod's [JSON Schema exporter](https://zod.dev/json-schema) produces checked-in Draft 2020-12 artifacts under [schemas](../schemas), so future non-TypeScript consumers can inspect the same wire constraints. JSON Schema validates shape, bounds, literals, and formats; configure consumers to enforce patterns/formats.

`parseContract` additionally rejects non-JSON/ambiguous JavaScript values and applies cross-field rules in [validate.ts](../src/domain/validate.ts): valid calendar timestamps, ordered windows/times, actual observation-window duration matching cohort rules, complete/partial count consistency, same tenant/site/scope revision across embedded references, metric/value type agreement, provider/cohort agreement, unique evidence links, non-overlapping supporting/contradicting references, action verification after execution, and non-self-referencing measurements. Those checks and the overall input-size limit are **not represented completely by JSON Schema**. Every generated artifact says so; wire acceptance alone is not full domain validation.

For non-JavaScript consumers, also enforce documented text limits in UTF-16 code units. JSON Schema `maxLength` uses Unicode code points while Zod uses JavaScript string length; supplementary characters can otherwise pass a portable schema but exceed the application limit. Malformed Unicode is rejected by the application boundary. Exported schemas are an interoperability aid with these explicit application checks, not a claim that every JSON Schema engine has identical behavior.

Generate with `npm run build` then `npm run schemas:generate`; validate drift with `npm run schemas:check`. Generation introduces no timestamps and refuses unexpected obsolete schema artifacts. Native Zod export fails on unrepresentable types instead of silently weakening them. No OpenAPI or MCP definition is supplied.

## Time and comparison identity

Timestamps use the deliberately narrow RFC3339-compatible UTC format `YYYY-MM-DDTHH:mm:ss.sssZ`; calendar-invalid values, offsets, omitted milliseconds, leap seconds, and reversed intervals are rejected. A point is a window with equal endpoints and point/zero-duration cohort rules. Other cohort rules declare a positive fixed duration, checked against observation and measured-result windows; timezone/calendar labels do not implement timezone scheduling. Source observation period, collection completion, receipt, and record creation/update remain distinct. Source period must end no later than collection; collection must precede receipt. Collection start/end and execution/verification ordering are checked where present. Retention availability is explicit; optional expiry records a stated boundary without establishing a customer retention policy.

`cohortIdentityHash` covers the versioned cohort, including ID/revision and its complete context. `compareCohorts` returns `comparable` only for identical declared context and revision, otherwise `discontinuous`. Provider, model, prompt cohort, configuration, geography, language, device, metric meaning/unit, site-scope revision, method/configuration, and window rules can therefore break comparison. Optional dimensions are not required for every sensor; omitted values are unspecified and never wildcards. This conservative identity does not independently prove collection quality or scientific comparability.

`assertComparableMeasurements` takes resolved baseline/follow-up records and rejects wrong relationships, different cohorts/methodologies, unmeasured/missing results, reversed or overlapping observation periods, and a non-comparable declared state. It does not look up records, produce a score, or infer an outcome. Future callers must also resolve observation references and verify their provenance/completeness and the applicability of omitted dimensions. A metric or provider change is not itself improvement/regression.

Outcome direction and attribution strength (`none`, `technical_verification`, `association`, `controlled_evidence`) are separate fields. Improved/regressed/unchanged records require at least two distinct measurement references and declared comparability; the declaration must later be checked against resolved evidence. Temporal association is never automatically causal attribution. Accepted recommendations cannot parse as actions; requested/executed action records require a separate authority reference, whose actual validity is a future governed responsibility.

## Deterministic hashing and bounds

[canonical-json.ts](../src/lib/canonical-json.ts) defines **G.A.S. canonical JSON v1**, not a claim of full RFC 8785/JCS compatibility:

- Sort object keys recursively by JavaScript UTF-16 code-unit order; retain array order.
- Encode scalar strings/numbers with ECMAScript JSON serialization, no whitespace; hash the resulting UTF-8 bytes using SHA-256.
- Preserve finite binary64 values; reject negative zero rather than silently collapse it into observed positive zero. No Unicode normalization is applied.
- Accept plain objects, null-prototype dictionaries, ordinary arrays, and JSON scalars. Reject unsupported scalars, proxies/classes, getters, hidden/symbol properties, sparse/extended arrays, cycles, and malformed Unicode. Repeated non-cyclic references serialize at each occurrence.
- Inject no timestamps, random IDs, or generated metadata. A field supplied by the caller is part of the hash; changing it changes identity.

`sha256Bytes` hashes exactly a supplied Uint8Array/Buffer view (maximum 1 MiB); it rejects shared or detached buffers. `hashCanonicalJson` hashes logical JSON. Hash equality provides neither cryptographic authenticity nor authorization. Do not collect/hash secrets as a substitute for excluding them.

`sourceRecordIdentityHash` hashes an explicit algorithm label plus the validated tenant/site/scope/provider/optional-connection/source-record tuple. It excludes collection/receipt/generated metadata. The same external source record under different tenants has different identity; a scope revision also changes this identity intentionally. This helper does not authorize tenant access or provide persistence isolation.

| Bound | Limit |
| --- | --- |
| Opaque identifier / version / revision | 128 characters / 64 characters / integer 1–1,000,000 |
| Missing reason / rationale | 512 / 2,048 characters, must include non-whitespace |
| Metric text / numeric value | 2,048 characters / finite magnitude at most 10^15 |
| Dimensions | Eight explicitly named optional entries; bounded strings or versioned references; no arbitrary extension bag |
| Evidence/observation/measurement references | At most 32 per list, with minimums where required |
| Canonical input | 64 KiB UTF-8, depth 32, 10,000 value occurrences, 1,000 entries per container, 16,384 code units per string/key |

Individual wire fields are more narrowly bounded than the generic hash helper. The aggregate canonical limit applies before application parsing. There are no recursive wire metadata extension points.

## Synthetic evidence and validation

[fixtures/synthetic/contracts.json](../fixtures/synthetic/contracts.json) contains an explicit synthetic marker and 28 named examples, covering all 11 registry schemas. Only `tenant-alpha`/`tenant-beta` and fictitious sites/providers are used. Source record IDs intentionally collide across tenants; source schema `7.3` remains distinct from contract `1.0`. No customer or live provider records are included.

Tests use `node:test` and `node:assert`, local fixtures, and deterministic built-ins. They require no internet, provider services, accounts, or credentials. Installation and advisory inspection are separate network-enabled development steps. Tests exercise the public parsing/hashing/comparison seams; they do not implement persistence or tenant authorization.

## Dependency and tool choices

The existing public [Website Quality Toolkit](https://github.com/LowcountryDigitalWorks/website-quality-toolkit) uses npm with a committed lockfile, ESM, Node 24, and Node's test runner. This repository follows those conventions with a smaller contracts-only configuration: Node 24.19.0, npm 11.17.0, strict TypeScript 7.0.2, and no application framework.

| Dependency | Purpose | Upstream license |
| --- | --- | --- |
| Zod 4.6.2 (production) | Actual bounded wire validation, inferred types, and native JSON Schema export | MIT |
| TypeScript 7.0.2 (development) | Strict typechecking and deterministic local compilation | Apache-2.0 |
| @types/node 24.13.4 (development) | Node 24 built-in crypto, filesystem, test, and assertion API types | MIT |
| undici-types 7.18.2 (transitive development) | Required by Node's type definitions; no HTTP client is used by the contract code | MIT |
| @typescript/typescript-* 7.0.2 (optional platform development packages) | TypeScript 7 native compiler binary selected for the host; other platforms remain lockfile entries | Apache-2.0 |

Dependencies retain their own licenses; no project license grant is added. The package is private and has no publishing or install lifecycle scripts. Install using `npm ci --ignore-scripts --no-audit --no-fund`. Do not omit optional dependencies: TypeScript 7 requires its platform compiler package. Review current releases/licenses/advisories before updating; a clean audit is a point-in-time result, not a security guarantee.
