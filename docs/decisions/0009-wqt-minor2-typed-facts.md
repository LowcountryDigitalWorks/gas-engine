# ADR 0009 — WQT minor2 typed facts remain adapter semantics

- **Status:** Candidate — GAS-SEM-001 exact-head review required
- **Date:** 2026-09-23
- **Authority:** Issue #27 and Product ORCH2 dependency-unlock record 5790501343
- **Accepted dependency:** LowcountryDigitalWorks/website-quality-toolkit `3d386537b278b3910af937feb95b3476e44f8831`

## Context

Historical Release 0.5 deliberately accepted WQT v1 minor1 and mapped each SiteOne finding only to its structured source status. Gate #25 later proved that this projection is too lossy for a recurring longitudinal service when a finding keeps the same high-level status while a structured magnitude changes.

WQT-SEM-001 evolved the normalization boundary to `ldw.website-quality.v1` minor2 with an optional bounded typed `facts[]` array on SiteOne findings. The accepted WQT normalizer derives reviewed facts from structured SiteOne source data and does not parse message prose or export raw provider tables/results.

G.A.S. already has canonical number/text/boolean observation values, units, source integrity, method/source-schema versioning, and a provider-neutral Release 0.7 comparator.

## Decision

The WQT adapter deliberately supports both historical minor1 and accepted minor2.

### Minor1

Preserve the historical semantic stream exactly:

- adapter mapping version `1.0.0`;
- source schema `ldw.website-quality@v1.1`;
- method configuration revision 1;
- SiteOne status-only finding semantics;
- `facts` is not part of the accepted minor1 input shape.

### Minor2

Use a new semantic stream:

- adapter mapping version `2.0.0`;
- source schema `ldw.website-quality@v1.2`;
- method configuration revision 2;
- retain the existing SiteOne status observation;
- emit one ordinary canonical observation for every valid normalized fact.

Generic fact mapping:

- metric ID: `wqt-siteone-fact-<fact-id>`;
- source unit/surface: the existing SiteOne finding;
- cohort suffix: `fact:<fact-id>`;
- number → canonical observed number;
- text → canonical observed text;
- boolean → canonical observed boolean;
- null → canonical explicit unknown;
- unit → canonical metric unit when supplied.

Fact IDs do not trigger provider-specific branches. Current `affected-resource-count` and `redirect-count` travel through the same generic mechanism.

Facts are ASCII-sorted before semantic source hashing/observation construction. Equivalent facts in a different input order or JSON formatting therefore produce the same semantic collections. Exact input-byte SHA remains formatting-sensitive diagnostic integrity.

The complete normalized finding slice, including facts and display wording, remains covered by ordinary source integrity. Message wording is not promoted to a canonical comparison value.

## Comparability

Minor1 and minor2 intentionally do not appear as the same comparable collection stream. Release 0.7 already requires collection adapter, source-schema, and method equality. Because those accepted contexts differ between minor1 and minor2, ordinary comparison fails with `collection_discontinuity`.

No comparator special case is added.

Historical minor1 evidence is not reinterpreted using minor2 semantics. A real Gate #25 replay must re-normalize preserved raw WQT evidence under accepted minor2 before comparing the two replay collections.

## Validation boundary

G.A.S. independently validates the accepted minor2 fact shape:

- maximum 8 facts per finding;
- closed objects;
- bounded/patterned fact IDs and units;
- number/text/boolean declarations;
- null as explicit unknown;
- finite safe-number bounds;
- bounded text;
- duplicate fact IDs fail closed;
- unexpected keys fail closed.

Lighthouse input remains structurally unchanged and does not accept `facts`.

## Consequences

- No canonical wire-schema change.
- No SQLite/persistence migration.
- No tenant/auth/review/operator contract change.
- No WQT runtime/scanner dependency.
- No SiteOne message parsing or raw payload consumption.
- No provider-specific logic in Release 0.7.
- No new npm dependency.
- Package version remains `0.9.0`; GAS-SEM-001 does not accept Release 1.0.
- Synthetic tests establish mechanism behavior only. Product ORCH2 owns the separate owner-controlled real Gate #25 minor2 replay and final GAS-SEM-001 disposition.
