import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Scope } from '../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import { prepareOperatorWorkspace, type OperatorWorkspaceRequest } from '../src/operator/workspace.js';
import { prepareManagedServiceRun, type ManagedServiceRun } from '../src/operator/service-run.js';
import {
  composePortfolioOperationsConsole,
  serializePortfolioOperationsJson,
  PORTFOLIO_OPERATIONS_VERSION,
} from '../src/operator/portfolio-operations.js';
import { renderPortfolioOperationsHtml } from '../src/operator/portfolio-operations-html.js';
import { alpha, beta } from '../tests/persistence/helpers.js';
import { serviceBriefSearchModules } from '../tests/operator/service-brief-fixtures.js';
import { serviceBriefPolicy } from '../tests/operator/service-brief-repo-support.js';

const artifactDirectory = resolve('local-artifacts/release-0.19-portfolio');
const databasePath = resolve(artifactDirectory, 'preview.sqlite');
const evaluatedAt = '2026-10-04T12:00:00.000Z';

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
  siteId: 'no-current-run-site',
  siteScopeRevisionId: 'no-current-run-site-beta-r1',
};

type Context = typeof alpha;

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
      id: 'release-019-preview-workspace',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  };
}

async function createRun(
  evidence: LocalEvidenceRepository,
  review: LocalReviewLedgerRepository,
  context: Context,
  scope: Scope,
  target: string,
  options: { sourceEnd: string; unavailable?: boolean; withReport?: boolean },
): Promise<ManagedServiceRun> {
  const modules = serviceBriefSearchModules(target, scope);
  const collection = modules.baseline.batches[0]!.collection;
  await evidence.createConnection(context, {
    id: collection.providerConnectionId!,
    scope: structuredClone(scope),
    providerId: collection.providerId,
  });
  for (const part of [...modules.baseline.batches, ...modules.current.batches]) {
    await evidence.persistCollection(context, part);
  }
  const workspaceInput = workspaceRequest(scope, target, modules);
  const workspace = await prepareOperatorWorkspace(evidence, review, context, workspaceInput);
  const selected = workspace.attention.slice(0, 1).map((item) => item.id);
  const reportRequest = options.withReport && selected.length > 0 ? {
    version: '0.17.0' as const,
    requestId: `release-019-preview-report-${scope.tenantId}`,
    createdAt: '2026-10-04T11:20:00.000Z',
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    title: 'Synthetic portfolio preview report',
    executiveSummary: 'Human-authored synthetic customer-safe summary used only to prove exact report-state projection.',
    selectedAttentionIds: selected,
    observedChanges: ['Synthetic human-reviewed current state.'],
    nextReview: 'Review the next exact comparable source window.',
    includeInternalAppendix: false,
  } : undefined;
  const receipts = [
    {
      id: 'search-export',
      sourceFamily: 'search_analytics',
      state: 'supplied' as const,
      artifactLabel: `synthetic-${scope.tenantId}-search-export.json`,
      sha256: scope.tenantId === 'tenant-alpha' ? 'a'.repeat(64) : 'b'.repeat(64),
      byteCount: 1024,
      sourceWindow: { start: options.sourceEnd, end: options.sourceEnd },
      collectedAt: options.sourceEnd,
      receivedAt: options.sourceEnd,
      limitations: ['Synthetic public-safe source receipt only.'],
    },
    ...(options.unavailable ? [{
      id: 'wqt-export',
      sourceFamily: 'website_quality',
      state: 'unavailable' as const,
      limitations: ['Synthetic source intentionally unavailable for operational proof.'],
    }] : []),
    ...(options.unavailable ? [{
      id: 'manual-context',
      sourceFamily: 'manual_context',
      state: 'supplied' as const,
      limitations: ['Synthetic supplied source intentionally has no freshness timestamp.'],
    }] : []),
  ];
  const result = await prepareManagedServiceRun(evidence, review, context, {
    workspaceRequest: workspaceInput,
    generatedAt: '2026-10-04T11:25:00.000Z',
    runPeriod: { start: '2026-10-01T00:00:00.000Z', end: '2026-10-04T11:10:00.000Z' },
    policy: {
      id: 'release-019-preview-run-policy',
      version: '1.0.0',
      maxReceipts: 16,
      maxPriorAttentionIds: 128,
    },
    receipts,
    ...(reportRequest === undefined ? {} : { customerReportRequest: reportRequest }),
  });
  return result.run;
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const filename of ['portfolio-operations.json', 'portfolio-operations.html', 'preview.sqlite', 'preview.sqlite-shm', 'preview.sqlite-wal']) {
    rmSync(resolve(artifactDirectory, filename), { force: true });
  }
  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    await evidence.createTenant(alpha);
    await evidence.createTenant(beta);
    for (const [context, scope, label] of [
      [alpha, alphaScope, 'Synthetic Alpha shared site'],
      [beta, betaScope, 'Synthetic Beta shared site'],
      [beta, noRunScope, 'Synthetic Beta no-current-run site'],
    ] as const) {
      await evidence.createSite(context, { id: scope.siteId, label });
      await evidence.createScope(context, scope);
    }

    const alphaRun = await createRun(
      evidence,
      review,
      alpha,
      alphaScope,
      'https://alpha.example.test',
      { sourceEnd: '2026-10-04T11:00:00.000Z', withReport: true },
    );
    const betaRun = await createRun(
      evidence,
      review,
      beta,
      betaScope,
      'https://beta.example.test',
      { sourceEnd: '2026-10-01T11:00:00.000Z', unavailable: true },
    );

    const policy = (suffix: string) => ({
      id: `release-019-preview-freshness-${suffix}`,
      version: '1.0.0',
      sources: [
        { sourceFamily: 'manual_context', maxAgeSeconds: 7_200 },
        { sourceFamily: 'search_analytics', maxAgeSeconds: 7_200 },
        { sourceFamily: 'website_quality', maxAgeSeconds: 7_200 },
      ],
    });
    const model = composePortfolioOperationsConsole({
      version: PORTFOLIO_OPERATIONS_VERSION,
      evaluatedAt,
      engagements: [
        {
          engagementId: 'engagement-alpha',
          label: 'Synthetic Alpha — current/fresh/report present',
          scope: alphaScope,
          trustedTarget: 'https://alpha.example.test',
          currentRun: alphaRun,
          freshnessPolicy: policy('alpha'),
        },
        {
          engagementId: 'engagement-beta',
          label: 'Synthetic Beta — stale/unavailable/unknown',
          scope: betaScope,
          trustedTarget: 'https://beta.example.test',
          currentRun: betaRun,
          freshnessPolicy: policy('beta'),
        },
        {
          engagementId: 'engagement-no-current-run',
          label: 'Synthetic Beta — trusted inventory / no current run',
          scope: noRunScope,
          trustedTarget: 'https://no-run.example.test',
          freshnessPolicy: policy('no-run'),
        },
      ],
    });
    const json = serializePortfolioOperationsJson(model);
    const html = renderPortfolioOperationsHtml(model);
    writeFileSync(resolve(artifactDirectory, 'portfolio-operations.json'), json, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(resolve(artifactDirectory, 'portfolio-operations.html'), html, { encoding: 'utf8', flag: 'wx' });

    console.log(`Release 0.19 portfolio identity: ${model.id}`);
    console.log(`Release 0.19 engagements: ${model.summary.engagementCount}; current=${model.summary.currentRun.present}; no-current=${model.summary.currentRun.noCurrentRun}`);
    console.log(`Release 0.19 JSON bytes: ${Buffer.byteLength(json, 'utf8')}`);
    console.log(`Release 0.19 HTML bytes: ${Buffer.byteLength(html, 'utf8')}`);
    console.log('Release 0.19 preview proves two tenants with deliberately overlapping siteId values, exact current-run verification, fresh/stale/unknown operational freshness, source unavailability, attention navigation, present/not-requested report state, and explicit no-current-run state.');
  } finally {
    review.close();
    evidence.close();
    for (const filename of ['preview.sqlite', 'preview.sqlite-shm', 'preview.sqlite-wal']) {
      rmSync(resolve(artifactDirectory, filename), { force: true });
    }
  }
}

await generate();
