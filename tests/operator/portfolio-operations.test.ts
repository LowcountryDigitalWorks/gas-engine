import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Scope } from '../../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import {
  prepareOperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../../src/operator/workspace.js';
import {
  ManagedServiceRunError,
  prepareManagedServiceRun,
  type ManagedServiceRun,
} from '../../src/operator/service-run.js';
import { parseManagedServiceRun } from '../../src/operator/service-run-import.js';
import {
  composePortfolioOperationsConsole,
  PortfolioOperationsError,
  PORTFOLIO_OPERATIONS_VERSION,
  serializePortfolioOperationsJson,
  type PortfolioEngagementInput,
} from '../../src/operator/portfolio-operations.js';
import { renderPortfolioOperationsHtml } from '../../src/operator/portfolio-operations-html.js';
import { alpha, beta } from '../persistence/helpers.js';
import { serviceBriefSearchModules } from './service-brief-fixtures.js';
import { serviceBriefPolicy } from './service-brief-repo-support.js';

const alphaScope: Scope = {
  tenantId: 'tenant-alpha',
  siteId: 'shared-site',
  siteScopeRevisionId: 'shared-site-alpha-r1',
};
const betaScope: Scope = {
  tenantId: 'tenant-beta',
  siteId: 'shared-site',
  siteScopeRevisionId: 'shared-site-beta-r1',
};
const noRunScope: Scope = {
  tenantId: 'tenant-beta',
  siteId: 'no-run-site',
  siteScopeRevisionId: 'no-run-site-beta-r1',
};

type Context = typeof alpha;

interface Repositories {
  evidence: LocalEvidenceRepository;
  review: LocalReviewLedgerRepository;
}

function workspaceRequest(scope: Scope, target: string, modules: ReturnType<typeof serviceBriefSearchModules>): OperatorWorkspaceRequest {
  return {
    serviceBriefRequest: {
      scope,
      trustedTarget: target,
      generatedAt: '2026-10-04T11:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: modules.searchAnalytics,
    },
    generatedAt: '2026-10-04T11:15:00.000Z',
    evaluatedAt: '2026-10-04T11:10:00.000Z',
    policy: {
      id: 'release-019-workspace-policy',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  };
}

async function setupRepositories(t: TestContext): Promise<Repositories> {
  const evidence = new LocalEvidenceRepository(':memory:');
  const review = new LocalReviewLedgerRepository(':memory:');
  t.after(() => { review.close(); evidence.close(); });
  for (const [context, scope, label] of [
    [alpha, alphaScope, 'Synthetic Alpha shared site'],
    [beta, betaScope, 'Synthetic Beta shared site'],
    [beta, noRunScope, 'Synthetic Beta no-run site'],
  ] as const) {
    if (scope === alphaScope) await evidence.createTenant(context);
    if (scope === betaScope) await evidence.createTenant(context);
    await evidence.createSite(context, { id: scope.siteId, label });
    await evidence.createScope(context, scope);
  }
  return { evidence, review };
}

async function createRun(
  repositories: Repositories,
  context: Context,
  scope: Scope,
  target: string,
  options: {
    sourceEnd: string;
    sourceState?: 'supplied' | 'not_supplied' | 'unsupported';
    unavailable?: boolean;
    unknownTimestamp?: boolean;
    withReport?: boolean;
  },
): Promise<ManagedServiceRun> {
  const modules = serviceBriefSearchModules(target, scope);
  const collection = modules.baseline.batches[0]!.collection;
  await repositories.evidence.createConnection(context, {
    id: collection.providerConnectionId!,
    scope: structuredClone(scope),
    providerId: collection.providerId,
  });
  for (const part of [...modules.baseline.batches, ...modules.current.batches]) {
    await repositories.evidence.persistCollection(context, part);
  }
  const request = workspaceRequest(scope, target, modules);
  const workspace = await prepareOperatorWorkspace(
    repositories.evidence,
    repositories.review,
    context,
    request,
  );
  const sourceState = options.sourceState ?? 'supplied';
  const receipts = [
    {
      id: 'search-export',
      sourceFamily: 'search_analytics',
      state: sourceState,
      ...(sourceState === 'supplied' ? {
        artifactLabel: 'synthetic-search-export.json',
        sha256: 'a'.repeat(64),
        byteCount: 1024,
        ...(options.unknownTimestamp ? {} : {
          sourceWindow: { start: options.sourceEnd, end: options.sourceEnd },
          collectedAt: options.sourceEnd,
          receivedAt: options.sourceEnd,
        }),
      } : {}),
      limitations: ['Synthetic public-safe source receipt only.'],
    },
    ...(options.unavailable ? [{
      id: 'wqt-export',
      sourceFamily: 'website_quality',
      state: 'unavailable' as const,
      limitations: ['Synthetic source intentionally unavailable.'],
    }] : []),
  ];
  const selected = workspace.attention.slice(0, 1).map((item) => item.id);
  const reportRequest = options.withReport && selected.length > 0 ? {
    version: '0.17.0' as const,
    requestId: 'release-019-synthetic-report',
    createdAt: '2026-10-04T11:20:00.000Z',
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    title: 'Synthetic portfolio proof report',
    executiveSummary: 'Human-authored synthetic summary for Release 0.19 validation.',
    selectedAttentionIds: selected,
    observedChanges: ['Synthetic human-reviewed current state.'],
    nextReview: 'Review a later exact comparable window.',
    includeInternalAppendix: false,
  } : undefined;
  const composition = await prepareManagedServiceRun(
    repositories.evidence,
    repositories.review,
    context,
    {
      workspaceRequest: request,
      generatedAt: '2026-10-04T11:25:00.000Z',
      runPeriod: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-04T11:10:00.000Z' },
      policy: {
        id: 'release-019-run-policy',
        version: '1.0.0',
        maxReceipts: 16,
        maxPriorAttentionIds: 128,
      },
      receipts,
      ...(reportRequest === undefined ? {} : { customerReportRequest: reportRequest }),
    },
  );
  return composition.run;
}

function inventoryEntry(
  engagementId: string,
  label: string,
  scope: Scope,
  target: string,
  run: ManagedServiceRun | undefined,
  maxAgeSeconds = 7_200,
): PortfolioEngagementInput {
  return {
    engagementId,
    label,
    scope: structuredClone(scope),
    trustedTarget: target,
    ...(run === undefined ? {} : { currentRun: structuredClone(run) }),
    freshnessPolicy: {
      id: 'release-019-freshness-policy',
      version: '1.0.0',
      sources: [
        { sourceFamily: 'search_analytics', maxAgeSeconds },
        { sourceFamily: 'website_quality', maxAgeSeconds },
      ],
    },
  };
}

async function fixture(t: TestContext) {
  const repositories = await setupRepositories(t);
  const alphaRun = await createRun(
    repositories,
    alpha,
    alphaScope,
    'https://alpha.example.test',
    { sourceEnd: '2026-10-04T11:00:00.000Z', withReport: true },
  );
  const betaRun = await createRun(
    repositories,
    beta,
    betaScope,
    'https://beta.example.test',
    { sourceEnd: '2026-10-01T11:00:00.000Z', unavailable: true },
  );
  return { alphaRun, betaRun };
}

test('Release 0.19 strict run import accepts genuine 0.18 output and rejects mutation/version/unknown fields', async (t) => {
  const { alphaRun } = await fixture(t);
  assert.deepEqual(parseManagedServiceRun(alphaRun), alphaRun);
  assert.throws(
    () => parseManagedServiceRun({ ...alphaRun, attentionIds: [...alphaRun.attentionIds, 'tampered-attention'] }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
  assert.throws(
    () => parseManagedServiceRun({ ...alphaRun, version: '0.18.1' }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
  assert.throws(
    () => parseManagedServiceRun({ ...alphaRun, tenantAuthority: 'forged' }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
});

test('Release 0.19 composes deterministic operational-only portfolio state across tenants', async (t) => {
  const { alphaRun, betaRun } = await fixture(t);
  const entries = [
    inventoryEntry('engagement-alpha', '<script>alert(1)</script> Alpha', alphaScope, 'https://alpha.example.test', alphaRun),
    inventoryEntry('engagement-beta', 'Synthetic Beta', betaScope, 'https://beta.example.test', betaRun),
    inventoryEntry('engagement-no-run', 'Synthetic No Run', noRunScope, 'https://no-run.example.test', undefined),
  ];
  const input = {
    version: PORTFOLIO_OPERATIONS_VERSION,
    evaluatedAt: '2026-10-04T12:00:00.000Z',
    engagements: entries,
  };
  const first = composePortfolioOperationsConsole(input);
  const reordered = composePortfolioOperationsConsole({ ...input, engagements: [...entries].reverse() });
  assert.equal(first.id, reordered.id, 'inventory input order must not define portfolio identity');
  assert.deepEqual(first.engagements, reordered.engagements);
  assert.equal(first.summary.engagementCount, 3);
  assert.equal(first.summary.currentRun.present, 2);
  assert.equal(first.summary.currentRun.noCurrentRun, 1);
  assert.equal(first.engagements[0]!.scope.siteId, first.engagements[1]!.scope.siteId);
  assert.notEqual(first.engagements[0]!.scope.tenantId, first.engagements[1]!.scope.tenantId);
  assert.equal(first.engagements[0]!.sources[0]!.freshness.state, 'fresh');
  assert.equal(first.engagements[1]!.sources.find((source) => source.sourceFamily === 'search_analytics')!.freshness.state, 'stale');
  assert.equal(first.engagements[1]!.sources.find((source) => source.sourceFamily === 'website_quality')!.sourceState, 'unavailable');
  assert.equal(first.engagements[2]!.currentRunState, 'no_current_run');
  assert.ok(first.engagements[2]!.exceptions.some((entry) => entry.kind === 'no_current_run'));
  assert.deepEqual(first.engagements[1]!.readiness, betaRun.readiness, 'freshness must never rewrite accepted readiness');

  const json = serializePortfolioOperationsJson(first);
  assert.doesNotMatch(
    JSON.stringify(first.summary),
    /"(?:clicks|impressions|ctr|rank|aiVisibility|citations|score)"\s*:/i,
  );
  assert.doesNotMatch(json, /best client|worst client|health score/i);

  const changedPolicy = composePortfolioOperationsConsole({
    ...input,
    engagements: [
      inventoryEntry('engagement-alpha', '<script>alert(1)</script> Alpha', alphaScope, 'https://alpha.example.test', alphaRun, 60),
      entries[1],
      entries[2],
    ],
  });
  assert.notEqual(changedPolicy.id, first.id, 'semantic freshness policy changes must alter portfolio identity');

  const html = renderPortfolioOperationsHtml(first);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|XMLHttpRequest|fetch\(/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.equal(first.id, composePortfolioOperationsConsole(input).id, 'presentation rendering must not define semantic identity');
});

test('Release 0.19 rejects duplicate inventory authority, cross-tenant run substitution, and target mismatch', async (t) => {
  const { alphaRun } = await fixture(t);
  const base = inventoryEntry('engagement-alpha', 'Alpha', alphaScope, 'https://alpha.example.test', alphaRun);
  const request = (engagements: PortfolioEngagementInput[]) => ({
    version: PORTFOLIO_OPERATIONS_VERSION,
    evaluatedAt: '2026-10-04T12:00:00.000Z',
    engagements,
  });
  assert.throws(
    () => composePortfolioOperationsConsole(request([base, { ...base }])),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'invalid_request',
  );
  assert.throws(
    () => composePortfolioOperationsConsole(request([
      base,
      { ...base, engagementId: 'duplicate-scope' },
    ])),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'invalid_request',
  );
  assert.throws(
    () => composePortfolioOperationsConsole(request([
      inventoryEntry('cross-tenant', 'Cross tenant', betaScope, 'https://alpha.example.test', alphaRun),
    ])),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'scope_mismatch',
  );
  assert.throws(
    () => composePortfolioOperationsConsole(request([
      inventoryEntry('wrong-target', 'Wrong target', alphaScope, 'https://wrong.example.test', alphaRun),
    ])),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'target_mismatch',
  );
});

test('Release 0.19 preserves unknown freshness and fails closed on future freshness anchors', async (t) => {
  const repositories = await setupRepositories(t);
  const unknownRun = await createRun(
    repositories,
    alpha,
    alphaScope,
    'https://alpha.example.test',
    { sourceEnd: '2026-10-04T11:00:00.000Z', unknownTimestamp: true },
  );
  const unknown = composePortfolioOperationsConsole({
    version: PORTFOLIO_OPERATIONS_VERSION,
    evaluatedAt: '2026-10-04T12:00:00.000Z',
    engagements: [inventoryEntry('unknown', 'Unknown freshness', alphaScope, 'https://alpha.example.test', unknownRun)],
  });
  assert.equal(unknown.engagements[0]!.sources[0]!.freshness.state, 'not_evaluable');
  assert.ok(unknown.engagements[0]!.exceptions.some((entry) => entry.kind === 'source_freshness_unknown'));

  const futureRun = await createRun(
    repositories,
    beta,
    betaScope,
    'https://beta.example.test',
    { sourceEnd: '2026-10-05T12:00:00.000Z' },
  );
  assert.throws(
    () => composePortfolioOperationsConsole({
      version: PORTFOLIO_OPERATIONS_VERSION,
      evaluatedAt: '2026-10-04T12:00:00.000Z',
      engagements: [inventoryEntry('future', 'Future freshness', betaScope, 'https://beta.example.test', futureRun)],
    }),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'invalid_request',
  );
});

test('Release 0.19 preserves not-supplied and unsupported source states without stale inference', async (t) => {
  const repositories = await setupRepositories(t);
  const notSuppliedRun = await createRun(
    repositories,
    alpha,
    alphaScope,
    'https://alpha.example.test',
    { sourceEnd: '2026-10-04T11:00:00.000Z', sourceState: 'not_supplied' },
  );
  const unsupportedRun = await createRun(
    repositories,
    beta,
    betaScope,
    'https://beta.example.test',
    { sourceEnd: '2026-10-04T11:00:00.000Z', sourceState: 'unsupported' },
  );
  const consoleModel = composePortfolioOperationsConsole({
    version: PORTFOLIO_OPERATIONS_VERSION,
    evaluatedAt: '2026-10-04T12:00:00.000Z',
    engagements: [
      inventoryEntry('not-supplied', 'Synthetic Not Supplied', alphaScope, 'https://alpha.example.test', notSuppliedRun),
      inventoryEntry('unsupported', 'Synthetic Unsupported', betaScope, 'https://beta.example.test', unsupportedRun),
    ],
  });

  for (const expectation of [
    { engagementId: 'not-supplied', sourceState: 'not_supplied', exceptionKind: 'source_not_supplied' },
    { engagementId: 'unsupported', sourceState: 'unsupported', exceptionKind: 'source_unsupported' },
  ] as const) {
    const engagement = consoleModel.engagements.find((entry) => entry.engagementId === expectation.engagementId);
    assert.ok(engagement);
    const source = engagement.sources.find((entry) => entry.receiptId === 'search-export');
    assert.ok(source);
    assert.equal(source.sourceState, expectation.sourceState);
    assert.deepEqual(source.freshness, {
      state: 'not_evaluable',
      reason: 'source_state_not_evaluable',
    });
    assert.ok(engagement.exceptions.some((entry) =>
      entry.kind === expectation.exceptionKind
      && entry.receiptId === 'search-export'
      && entry.sourceFamily === 'search_analytics'));
    assert.ok(!engagement.exceptions.some((entry) => entry.kind === 'source_stale'));
    assert.equal(
      consoleModel.summary.sourceStates.find((entry) => entry.state === expectation.sourceState)?.count,
      1,
    );
  }
});

test('Release 0.19 request bounds and strict surface fail closed', () => {
  const tooMany = Array.from({ length: 65 }, (_, index) => ({
    engagementId: `engagement-${index}`,
    label: `Synthetic ${index}`,
    scope: { tenantId: `tenant-${index}`, siteId: 'site', siteScopeRevisionId: 'r1' },
    trustedTarget: `https://example-${index}.test`,
    freshnessPolicy: { id: 'policy', version: '1.0.0', sources: [] },
  }));
  assert.throws(
    () => composePortfolioOperationsConsole({
      version: PORTFOLIO_OPERATIONS_VERSION,
      evaluatedAt: '2026-10-04T12:00:00.000Z',
      engagements: tooMany,
    }),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'invalid_request',
  );
  assert.throws(
    () => composePortfolioOperationsConsole({
      version: PORTFOLIO_OPERATIONS_VERSION,
      evaluatedAt: '2026-10-04T12:00:00.000Z',
      engagements: [{
        engagementId: 'one', label: 'One', scope: alphaScope, trustedTarget: 'https://alpha.example.test',
        freshnessPolicy: { id: 'policy', version: '1.0.0', sources: [] },
      }],
      priorityPolicy: 'forbidden',
    }),
    (error: unknown) => error instanceof PortfolioOperationsError && error.code === 'invalid_request',
  );
});
