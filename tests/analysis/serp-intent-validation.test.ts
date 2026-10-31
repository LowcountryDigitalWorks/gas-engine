import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SERP_INTENT_LIMITATIONS,
  SERP_INTENT_PROFILE_VERSION,
  SerpIntentValidationError,
  isUnresolvedGoogleGoToDestinationUrl,
  validateSerpIntentProfile,
  type SerpIntentPolicy,
  type SerpSnapshot,
} from '../../src/analysis/serp-intent-validation.js';

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

const baseSource: SerpSnapshot['source'] = {
  providerId: 'synthetic-serp-provider',
  methodId: 'organic-serp-snapshot',
  methodVersion: '1.0.0',
  location: 'us-sc',
  language: 'en-US',
  device: 'desktop',
  searchSurface: 'web',
  observedAt: '2026-10-27T12:00:00.000Z',
  receivedAt: '2026-10-27T12:00:30.000Z',
  sourceSchemaVersion: '1.0.0',
  requestedDepth: 10,
  coverage: 'complete',
  truncated: false,
};

function policy(overrides: Partial<SerpIntentPolicy> = {}): SerpIntentPolicy {
  return {
    id: 'serp-intent-policy',
    version: '1.0.0',
    topK: 5,
    minimumComparableQueryPairs: 1,
    exactUrlOverlapSameFamilyThreshold: 0.6,
    exactUrlOverlapDistinctFamilyThreshold: 0.25,
    maximumCollectionTimeSkewSeconds: 600,
    minimumBorderlineSnapshots: 1,
    comparability: {
      provider: true,
      method: true,
      location: true,
      language: true,
      device: true,
      searchSurface: true,
      sourceSchemaVersion: true,
    },
    urlComparison: 'exact',
    duplicateUrlPolicy: 'dedupe_exact_only',
    domainComparison: 'supplied_registrable_domain',
    ...overrides,
  };
}

function organic(url: string, sameTypeRank?: number, registrableDomain?: string) {
  return {
    type: 'organic',
    url,
    ...(sameTypeRank === undefined ? {} : { sameTypeRank }),
    ...(registrableDomain === undefined ? {} : { registrableDomain }),
  };
}

function snapshot(
  queryId: string,
  urls: readonly string[],
  overrides: Partial<SerpSnapshot> = {},
): SerpSnapshot {
  return {
    queryId,
    query: `synthetic ${queryId}`,
    source: structuredClone(baseSource),
    results: urls.map((url, index) => organic(url, index + 1, new URL(url).hostname)),
    ...overrides,
  } as SerpSnapshot;
}

const sameLeft = [
  'https://a.test/one',
  'https://b.test/two',
  'https://c.test/three',
  'https://d.test/four',
  'https://e.test/five',
];
const sameRight = [
  'https://a.test/one',
  'https://b.test/two',
  'https://c.test/three',
  'https://d.test/four',
  'https://x.test/five',
];
const distinctRight = [
  'https://v.test/one',
  'https://w.test/two',
  'https://x.test/three',
  'https://y.test/four',
  'https://z.test/five',
];
const ambiguousRight = [
  'https://a.test/one',
  'https://b.test/two',
  'https://c.test/three',
  'https://y.test/four',
  'https://z.test/five',
];

function input(
  rightUrls: readonly string[] = sameRight,
  overrides: {
    left?: SerpSnapshot;
    right?: SerpSnapshot;
    candidatePolicy?: SerpIntentPolicy;
    representatives?: Array<{ clusterId: string; queryId: string }>;
    snapshots?: SerpSnapshot[];
    selectionId?: string;
    selectionVersion?: string;
  } = {},
) {
  const left = overrides.left ?? snapshot('query-a', sameLeft);
  const right = overrides.right ?? snapshot('query-b', rightUrls);
  return {
    selection: {
      id: overrides.selectionId ?? 'representative-selection',
      version: overrides.selectionVersion ?? '1.0.0',
      upstreamPageFocusCandidateId: 'gsc.page-focus:synthetic',
      representatives: overrides.representatives ?? [
        { clusterId: 'cluster-a', queryId: 'query-a' },
        { clusterId: 'cluster-b', queryId: 'query-b' },
      ],
    },
    policy: overrides.candidatePolicy ?? policy(),
    snapshots: overrides.snapshots ?? [left, right],
  };
}

test('high exact URL overlap yields same_result_family_candidate', () => {
  const profile = validateSerpIntentProfile(input());
  assert.equal(profile.state, 'same_result_family_candidate');
  assert.equal(profile.comparisons[0]?.snapshots[0]?.exactUrlOverlap.intersectionCount, 4);
  assert.equal(profile.comparisons[0]?.snapshots[0]?.exactUrlOverlap.unionCount, 6);
  assert.equal(profile.comparisons[0]?.snapshots[0]?.exactUrlOverlap.jaccard, 4 / 6);
  assert.deepEqual(profile.comparisons[0]?.snapshots[0]?.requestedDepth, { left: 10, right: 10 });
  assert.deepEqual(profile.comparisons[0]?.snapshots[0]?.actualEligibleOrganicDepth, { left: 5, right: 5 });
});

test('low exact URL overlap yields distinct_result_family_candidate', () => {
  assert.equal(validateSerpIntentProfile(input(distinctRight)).state, 'distinct_result_family_candidate');
});

test('ambiguity-band overlap yields ambiguous', () => {
  const profile = validateSerpIntentProfile(input(ambiguousRight));
  assert.equal(profile.state, 'ambiguous');
  assert.equal(profile.comparisons[0]?.snapshots[0]?.exactUrlOverlap.jaccard, 3 / 7);
});

test('missing, failed, partial, and truncated evidence are not_ready and never manufactured zero overlap', () => {
  const missing = input();
  missing.snapshots = [missing.snapshots[0]!];
  const missingProfile = validateSerpIntentProfile(missing);
  assert.equal(missingProfile.state, 'not_ready');
  assert.ok(missingProfile.reasons.includes('missing_serp_evidence'));
  assert.equal(missingProfile.comparisons.length, 0);

  for (const [field, value, reason] of [
    ['coverage', 'failed', 'failed_serp_evidence'],
    ['coverage', 'partial', 'partial_serp_evidence'],
    ['truncated', true, 'truncated_serp_evidence'],
  ] as const) {
    const right = snapshot('query-b', distinctRight);
    (right.source as Mutable<SerpSnapshot['source']>)[field] = value as never;
    const profile = validateSerpIntentProfile(input(distinctRight, { right }));
    assert.equal(profile.state, 'not_ready');
    assert.ok(profile.reasons.includes(reason));
    assert.equal(profile.comparisons.length, 0);
  }
});

test('requested depth never substitutes for insufficient actual eligible organic depth', () => {
  const right = snapshot('query-b', ['https://a.test/one', 'https://b.test/two']);
  (right.source as Mutable<SerpSnapshot['source']>).requestedDepth = 100;
  right.results.push({ type: 'local_pack' }, { type: 'shopping' }, { type: 'video' });
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('insufficient_eligible_organic_depth'));
});

test('provider/method/location/language/device/search-surface/schema/time mismatches fail closed', () => {
  const variants: Array<[keyof SerpSnapshot['source'], unknown, string]> = [
    ['providerId', 'other-provider', 'provider_mismatch'],
    ['methodId', 'other-method', 'method_mismatch'],
    ['methodVersion', '2.0.0', 'method_mismatch'],
    ['location', 'us-ga', 'location_mismatch'],
    ['language', 'fr-FR', 'language_mismatch'],
    ['device', 'mobile', 'device_mismatch'],
    ['searchSurface', 'images', 'search_surface_mismatch'],
    ['sourceSchemaVersion', '2.0.0', 'source_schema_mismatch'],
    ['observedAt', '2026-10-27T13:00:00.000Z', 'collection_time_skew_exceeded'],
  ];
  for (const [field, value, reason] of variants) {
    const right = snapshot('query-b', sameRight);
    (right.source as Mutable<SerpSnapshot['source']>)[field] = value as never;
    const profile = validateSerpIntentProfile(input(sameRight, { right }));
    assert.equal(profile.state, 'not_ready', field);
    assert.ok(profile.reasons.includes(reason as any), field);
  }
});

test('exact URL overlap and supplied registrable-domain overlap remain separate', () => {
  const left = snapshot('query-a', sameLeft);
  const right = snapshot('query-b', [
    'https://a.test/other',
    'https://b.test/other',
    'https://c.test/other',
    'https://d.test/other',
    'https://e.test/other',
  ]);
  const profile = validateSerpIntentProfile(input([], { left, right }));
  assert.equal(profile.state, 'distinct_result_family_candidate');
  const comparison = profile.comparisons[0]!.snapshots[0]!;
  assert.equal(comparison.exactUrlOverlap.jaccard, 0);
  assert.equal(comparison.registrableDomainOverlap.available, true);
  assert.equal(comparison.registrableDomainOverlap.jaccard, 1);
});

test('missing supplied registrable domains does not become URL overlap or fail readiness', () => {
  const right = snapshot('query-b', sameRight);
  delete (right.results[0] as Mutable<(typeof right.results)[number]>).registrableDomain;
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'same_result_family_candidate');
  assert.deepEqual(profile.comparisons[0]!.snapshots[0]!.registrableDomainOverlap, {
    available: false,
    reason: 'registrable_domain_missing',
  });
});

test('mixed SERP features do not contaminate organic top-K selection', () => {
  const right = snapshot('query-b', sameRight);
  right.results.unshift(
    { type: 'local_pack' },
    { type: 'shopping' },
    { type: 'people_also_ask' },
    { type: 'ai_overview' },
  );
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'same_result_family_candidate');
  const comparison = profile.comparisons[0]!.snapshots[0]!;
  assert.equal(comparison.actualEligibleOrganicDepth.right, 5);
  assert.equal(comparison.resultShape.right.countsByType.local_pack, 1);
  assert.equal(comparison.resultShape.right.countsByType.organic, 5);
});

test('provider same-type rank controls organic ordering when supplied', () => {
  const right = snapshot('query-b', sameRight);
  right.results = [
    organic('https://x.test/five', 5, 'x.test'),
    organic('https://d.test/four', 4, 'd.test'),
    organic('https://c.test/three', 3, 'c.test'),
    organic('https://b.test/two', 2, 'b.test'),
    organic('https://a.test/one', 1, 'a.test'),
  ];
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  const comparison = profile.comparisons[0]!.snapshots[0]!;
  assert.equal(comparison.organicOrdering.right, 'provider_same_type_rank');
  assert.deepEqual(comparison.exactUrlOverlap.rightTopKUrls, sameRight);
});

test('partial or duplicate same-type rank semantics fail closed', () => {
  const partial = snapshot('query-b', sameRight);
  delete (partial.results[1] as Mutable<(typeof partial.results)[number]>).sameTypeRank;
  const partialProfile = validateSerpIntentProfile(input(sameRight, { right: partial }));
  assert.equal(partialProfile.state, 'not_ready');
  assert.ok(partialProfile.reasons.includes('incompatible_organic_rank_semantics'));

  const duplicate = snapshot('query-b', sameRight);
  (duplicate.results[1] as Mutable<(typeof duplicate.results)[number]>).sameTypeRank = 1;
  const duplicateProfile = validateSerpIntentProfile(input(sameRight, { right: duplicate }));
  assert.equal(duplicateProfile.state, 'not_ready');
  assert.ok(duplicateProfile.reasons.includes('incompatible_organic_rank_semantics'));
});

test('organic result rows without URLs fail closed as incompatible result typing', () => {
  const right = snapshot('query-b', sameRight);
  right.results.unshift({ type: 'organic', sameTypeRank: 99 });
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('incompatible_result_typing'));
  assert.equal(profile.comparisons.length, 0);
});

test('representative-query and snapshot input order cannot change deterministic identity/output', () => {
  const first = validateSerpIntentProfile(input());
  const reordered = input();
  reordered.selection.representatives.reverse();
  reordered.snapshots.reverse();
  const second = validateSerpIntentProfile(reordered);
  assert.deepEqual(second, first);
});

test('changed query set, selection revision, or policy revision changes profile identity', () => {
  const base = validateSerpIntentProfile(input());
  const selectionRevision = validateSerpIntentProfile(input(sameRight, { selectionVersion: '1.0.1' }));
  const policyRevision = validateSerpIntentProfile(input(sameRight, { candidatePolicy: policy({ version: '1.0.1' }) }));
  const changedQuery = input();
  changedQuery.selection.representatives[1] = { clusterId: 'cluster-b', queryId: 'query-c' };
  changedQuery.snapshots[1] = snapshot('query-c', sameRight);
  const queryRevision = validateSerpIntentProfile(changedQuery);
  assert.notEqual(selectionRevision.id, base.id);
  assert.notEqual(policyRevision.id, base.id);
  assert.notEqual(queryRevision.id, base.id);
});

test('duplicate exact URLs are deduped while URL variants remain distinct', () => {
  const right = snapshot('query-b', []);
  right.results = [
    organic('https://a.test/one', 1, 'a.test'),
    organic('https://a.test/one', 2, 'a.test'),
    organic('https://a.test/one/', 3, 'a.test'),
    organic('https://b.test/two', 4, 'b.test'),
    organic('https://c.test/three', 5, 'c.test'),
    organic('https://d.test/four', 6, 'd.test'),
    organic('https://e.test/five', 7, 'e.test'),
  ];
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.notEqual(profile.state, 'not_ready');
  const urls = profile.comparisons[0]!.snapshots[0]!.exactUrlOverlap.rightTopKUrls;
  assert.equal(urls.filter((url) => url === 'https://a.test/one').length, 1);
  assert.equal(new Set(urls).has('https://a.test/one/'), true);
});

test('result-shape differences are descriptive only and cannot change candidate state', () => {
  const baseline = validateSerpIntentProfile(input());
  const right = snapshot('query-b', sameRight);
  right.results.push({ type: 'local_pack' }, { type: 'shopping' }, { type: 'video' });
  const shaped = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(shaped.state, baseline.state);
  assert.equal(shaped.resultShapeContextIsDescriptiveOnly, true);
  assert.notDeepEqual(shaped.comparisons[0]!.snapshots[0]!.resultShape, baseline.comparisons[0]!.snapshots[0]!.resultShape);
});

test('borderline repeated-snapshot policy fails closed until configured repeat count is met', () => {
  const candidatePolicy = policy({ minimumBorderlineSnapshots: 2 });
  const one = validateSerpIntentProfile(input(ambiguousRight, { candidatePolicy }));
  assert.equal(one.state, 'not_ready');
  assert.ok(one.reasons.includes('borderline_repeat_requirement_unmet'));

  const left1 = snapshot('query-a', sameLeft);
  const right1 = snapshot('query-b', ambiguousRight);
  const left2 = snapshot('query-a', sameLeft, {
    source: { ...baseSource, observedAt: '2026-10-27T12:05:00.000Z' },
  });
  const right2 = snapshot('query-b', ambiguousRight, {
    source: { ...baseSource, observedAt: '2026-10-27T12:05:00.000Z' },
  });
  const repeated = validateSerpIntentProfile(input(ambiguousRight, {
    candidatePolicy,
    snapshots: [right2, left1, right1, left2],
  }));
  assert.equal(repeated.state, 'ambiguous');
  assert.equal(repeated.comparisons[0]!.snapshots.length, 2);
});

test('too few comparable representative query pairs is not_ready', () => {
  const profile = validateSerpIntentProfile(input(sameRight, {
    candidatePolicy: policy({ minimumComparableQueryPairs: 2 }),
  }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('too_few_comparable_query_pairs'));
});

test('unselected query evidence is rejected as not_ready instead of becoming authority', () => {
  const extra = snapshot('query-outside-selection', sameLeft);
  const profile = validateSerpIntentProfile(input(sameRight, {
    snapshots: [snapshot('query-a', sameLeft), snapshot('query-b', sameRight), extra],
  }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('query_not_in_selection'));
});

test('policy validation preserves an explicit ambiguity band', () => {
  for (const candidatePolicy of [
    policy({ exactUrlOverlapDistinctFamilyThreshold: 0.6 }),
    policy({ exactUrlOverlapDistinctFamilyThreshold: 0.7 }),
  ]) {
    assert.throws(
      () => validateSerpIntentProfile(input(sameRight, { candidatePolicy })),
      (error: unknown) => error instanceof SerpIntentValidationError && error.code === 'invalid_policy',
    );
  }
});

test('output is bounded plain JSON-compatible data with explicit human/no-action ceilings', () => {
  const profile = validateSerpIntentProfile(input());
  assert.equal(profile.methodologyVersion, SERP_INTENT_PROFILE_VERSION);
  assert.equal(profile.humanIntentReviewRequired, true);
  assert.equal(profile.noAutomaticPageChange, true);
  assert.equal(profile.resultShapeContextIsDescriptiveOnly, true);
  assert.deepEqual(profile.limitations, SERP_INTENT_LIMITATIONS);
  const encoded = JSON.stringify(profile);
  assert.ok(encoded.length < 65_536);
  assert.deepEqual(JSON.parse(encoded), profile);
  for (const forbiddenKey of ['split', 'merge', 'redirect', 'canonical', 'rewrite', 'createPage', 'deletePage', 'action']) {
    assert.equal(Object.prototype.hasOwnProperty.call(profile, forbiddenKey), false, forbiddenKey);
  }
});

test('module surface contains no provider/network/runtime side effect authority', () => {
  const profile = validateSerpIntentProfile(input());
  assert.ok(profile.id.startsWith('gas.serp-intent:'));
  assert.equal(profile.id.length, 'gas.serp-intent:'.length + 64);
  assert.equal(profile.sourceContexts.length, 2);
  assert.equal(profile.policy.urlComparison, 'exact');
  assert.equal(profile.policy.duplicateUrlPolicy, 'dedupe_exact_only');
  assert.equal(profile.policy.domainComparison, 'supplied_registrable_domain');
});

const googleGoTo = 'https://www.google.com/goto/url?url=https%3A%2F%2Fdestination.test%2Fpage&sa=U';

test('unresolved Google GoTo URLs in the organic top-K window are not_ready', () => {
  assert.equal(isUnresolvedGoogleGoToDestinationUrl(googleGoTo), true);
  assert.equal(isUnresolvedGoogleGoToDestinationUrl('https://destination.test/page'), false);

  const right = snapshot('query-b', [
    'https://a.test/one',
    googleGoTo,
    'https://c.test/three',
    'https://d.test/four',
    'https://e.test/five',
  ]);
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('unresolved_result_destination'));
  assert.equal(profile.comparisons.length, 0);
});

test('unresolved GoTo URLs do not contribute google.com registrable-domain overlap', () => {
  const left = snapshot('query-a', sameLeft);
  const right = snapshot('query-b', [
    'https://a.test/other',
    googleGoTo,
    'https://c.test/other',
    'https://d.test/other',
    'https://e.test/other',
  ]);
  for (const row of right.results) {
    if (row.url === googleGoTo) {
      (row as Mutable<(typeof right.results)[number]>).registrableDomain = 'google.com';
    }
  }
  const profile = validateSerpIntentProfile(input(sameRight, { left, right }));
  assert.equal(profile.state, 'not_ready');
  assert.ok(profile.reasons.includes('unresolved_result_destination'));
});

test('upstream-resolved direct destination URLs remain eligible organic evidence', () => {
  const resolved = 'https://destination.test/resolved-page';
  const right = snapshot('query-b', [
    'https://a.test/one',
    resolved,
    'https://c.test/three',
    'https://d.test/four',
    'https://e.test/five',
  ]);
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'same_result_family_candidate');
  assert.ok(profile.comparisons[0]!.snapshots[0]!.exactUrlOverlap.rightTopKUrls.includes(resolved));
});

test('Google GoTo URLs beyond top-K do not block resolved organic comparison', () => {
  const right = snapshot('query-b', [
    'https://a.test/one',
    'https://b.test/two',
    'https://c.test/three',
    'https://d.test/four',
    'https://e.test/five',
    googleGoTo,
  ]);
  const profile = validateSerpIntentProfile(input(sameRight, { right }));
  assert.equal(profile.state, 'same_result_family_candidate');
  assert.equal(
    profile.comparisons[0]!.snapshots[0]!.exactUrlOverlap.rightTopKUrls.includes(googleGoTo),
    false,
  );
});
