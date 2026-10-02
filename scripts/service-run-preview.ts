import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptWqtNormalizedEvidence,
  resolveWqtProviderSnapshots,
  type WqtAdapterConfig,
} from '../src/adapters/wqt.js';
import { compareEvidenceSnapshots } from '../src/analysis/diff.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createOperatorActionArtifact,
  prepareOperatorWorkspaceDecision,
} from '../src/operator/workspace-action.js';
import {
  prepareOperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../src/operator/workspace.js';
import {
  composeManagedServiceRunPackage,
  prepareManagedServiceRun,
  summarizeManagedServiceRun,
} from '../src/operator/service-run.js';
import { alpha } from '../tests/persistence/helpers.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from '../tests/operator/service-brief-fixtures.js';
import { serviceBriefPolicy } from '../tests/operator/service-brief-repo-support.js';

type MutableJson = Record<string, any>;

const artifactDirectory = resolve('local-artifacts/release-0.18-service-run');
const databasePath = resolve(artifactDirectory, 'preview.sqlite');

function wqtMinor3(value: MutableJson, skippedCount: number): MutableJson {
  const next = structuredClone(value);
  next.schemaMinorVersion = 3;
  next.sources.siteone.observations.push({
    source: 'siteone',
    code: 'crawl-skipped-urls',
    sourceStatus: 'NOTICE',
    message: 'Synthetic skipped URL context.',
    facts: [
      { id: 'skipped-url-count', valueType: 'number', value: skippedCount, unit: 'count' },
      { id: 'external-not-allowed-host-count', valueType: 'number', value: 2, unit: 'count' },
      { id: 'internal-skipped-url-count', valueType: 'number', value: 4, unit: 'count' },
      { id: 'other-skipped-url-count', valueType: 'number', value: 1, unit: 'count' },
    ],
  });
  next.observations = [
    ...next.sources.siteone.observations,
    ...next.sources.lighthouse.observations,
  ].sort((left: MutableJson, right: MutableJson) =>
    `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`));
  return next;
}

function wqtConfig(observedAt: string): WqtAdapterConfig {
  return {
    scope: structuredClone(serviceBriefScope),
    expectedSiteId: 'example-site',
    expectedTargetOrigin: 'https://example.test',
    providerConnectionIds: {
      siteone: 'release-018-preview-siteone',
      lighthouse: 'release-018-preview-lighthouse',
    },
    timing: {
      observedAt,
      startedAt: observedAt,
      endedAt: observedAt,
      collectedAt: observedAt,
      receivedAt: observedAt,
    },
    availability: {
      siteone: { state: 'available', reference: 'synthetic-release-018-siteone' },
      lighthouse: { state: 'available', reference: 'synthetic-release-018-lighthouse' },
    },
  };
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const filename of [
    'service-run.json',
    'operator-workspace.json',
    'operator-workspace.html',
    'customer-report.json',
    'customer-report.html',
    'package-manifest.json',
    'preview.sqlite',
    'preview.sqlite-shm',
    'preview.sqlite-wal',
  ]) rmSync(resolve(artifactDirectory, filename), { force: true });

  const baseWqt = JSON.parse(readFileSync('tests/fixtures/wqt-normalized-v1.2.json', 'utf8')) as MutableJson;
  const baselineBytes = Buffer.from(JSON.stringify(wqtMinor3(baseWqt, 7)), 'utf8');
  const currentBytes = Buffer.from(JSON.stringify(wqtMinor3(baseWqt, 8)), 'utf8');
  const baselineWqt = adaptWqtNormalizedEvidence(
    baselineBytes,
    wqtConfig('2026-10-01T09:00:00.000Z'),
  );
  const currentWqt = adaptWqtNormalizedEvidence(
    currentBytes,
    wqtConfig('2026-10-02T09:00:00.000Z'),
  );
  const baselineSnapshots = resolveWqtProviderSnapshots(baselineWqt);
  const currentSnapshots = resolveWqtProviderSnapshots(currentWqt);
  const siteOneDelta = compareEvidenceSnapshots(baselineSnapshots[0], currentSnapshots[0]);

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    await evidence.createTenant(alpha);
    await evidence.createSite(alpha, {
      id: serviceBriefScope.siteId,
      label: 'Synthetic Release 0.18 example.test service run',
    });
    await evidence.createScope(alpha, serviceBriefScope);

    const modules = serviceBriefSearchModules('https://example.test', serviceBriefScope);
    const searchCollection = modules.baseline.batches[0]!.collection;
    await evidence.createConnection(alpha, {
      id: searchCollection.providerConnectionId!,
      scope: structuredClone(searchCollection.scope),
      providerId: searchCollection.providerId,
    });
    for (const part of [...modules.baseline.batches, ...modules.current.batches]) {
      await evidence.persistCollection(alpha, part);
    }

    const serviceBriefRequest = {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-02T12:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: modules.searchAnalytics,
    };
    const initialWorkspaceRequest: OperatorWorkspaceRequest = {
      serviceBriefRequest,
      generatedAt: '2026-10-02T12:10:00.000Z',
      evaluatedAt: '2026-10-02T12:05:00.000Z',
      policy: {
        id: 'release-018-preview-workspace',
        version: '1.0.0',
        maxTimelineEntries: 128,
        maxAttentionRows: 128,
        maxEvidenceRows: 256,
      },
    };
    const initialWorkspace = await prepareOperatorWorkspace(
      evidence,
      review,
      alpha,
      initialWorkspaceRequest,
    );
    const selectedAttention = initialWorkspace.attention[0];
    if (selectedAttention === undefined) {
      throw new Error('Release 0.18 preview requires at least one accepted Attention item.');
    }
    const decisionArtifact = createOperatorActionArtifact(
      initialWorkspace,
      'release-018-preview-decision',
      '2026-10-02T12:12:00.000Z',
      {
        type: 'prepare_decision',
        selectedAttentionIds: [selectedAttention.id],
        decision: {
          id: 'release-018-preview-decision',
          disposition: 'investigate',
          summary: 'Human selected one exact accepted Attention item for synthetic managed-service review.',
          recordedAt: '2026-10-02T12:12:00.000Z',
        },
        policy: {
          id: 'release-018-preview-decision-policy',
          version: '1.0.0',
          maxSelectedAttentionItems: 8,
        },
        generatedAt: '2026-10-02T12:12:00.000Z',
        evaluatedAt: '2026-10-02T12:05:00.000Z',
      },
    );
    const prepared = await prepareOperatorWorkspaceDecision(
      evidence,
      review,
      alpha,
      initialWorkspaceRequest,
      decisionArtifact,
    );
    const workspaceRequest = prepared.nextWorkspaceRequest;
    const workspace = prepared.workspace;

    const baseReceipts = [
      {
        id: 'wqt-normalized',
        sourceFamily: 'website_quality',
        state: 'supplied' as const,
        artifactLabel: 'synthetic-wqt-normalized-v1.3.json',
        sha256: currentWqt.inputSha256,
        byteCount: currentBytes.byteLength,
        sourceWindow: {
          start: '2026-10-02T09:00:00.000Z',
          end: '2026-10-02T09:00:00.000Z',
        },
        collectedAt: '2026-10-02T09:00:00.000Z',
        receivedAt: '2026-10-02T09:00:00.000Z',
        adapter: { id: 'ldw-wqt-normalized', version: '3.0.0' },
        sourceSchema: { id: 'ldw.website-quality', version: 'v1.3' },
        limitations: ['Synthetic public-safe WQT normalized evidence only.'],
      },
      {
        id: 'discovery-export',
        sourceFamily: 'discovery_diagnostics',
        state: 'unavailable' as const,
        limitations: ['Synthetic preview intentionally marks this source unavailable.'],
      },
      {
        id: 'manual-context',
        sourceFamily: 'manual_context',
        state: 'not_supplied' as const,
        limitations: [],
      },
    ];

    const first = await prepareManagedServiceRun(
      evidence,
      review,
      alpha,
      {
        workspaceRequest,
        generatedAt: '2026-10-02T12:20:00.000Z',
        runPeriod: {
          start: '2026-10-01T00:00:00.000Z',
          end: '2026-10-02T12:05:00.000Z',
        },
        policy: {
          id: 'release-018-preview-run-policy',
          version: '1.0.0',
          maxReceipts: 16,
          maxPriorAttentionIds: 128,
        },
        receipts: baseReceipts,
      },
    );
    const prior = summarizeManagedServiceRun(first.run);

    const selectedReportIds = workspace.attention
      .slice(0, Math.min(3, workspace.attention.length))
      .map((item) => item.id);
    const reportRequest = {
      version: '0.17.0' as const,
      requestId: 'release-018-preview-customer-report',
      createdAt: '2026-10-02T12:30:00.000Z',
      workspaceId: workspace.id,
      sourceBriefId: workspace.source.serviceBriefId,
      sourceDossierId: workspace.source.decisionCycleDossierId,
      title: 'Synthetic example.test managed-service review',
      executiveSummary: 'Human-authored preview summary for the deterministic Release 0.18 service-run package.',
      selectedAttentionIds: selectedReportIds,
      observedChanges: [
        'Human reviewed the current accepted workspace evidence.',
        'Synthetic WQT minor-3 SiteOne count evidence changed descriptively between exact compatible snapshots.',
      ],
      nextReview: 'Repeat the same accepted collection methods in a later comparable window; no automatic outcome claim is made.',
      includeInternalAppendix: false,
    };

    const currentReceipts = [
      baseReceipts[0]!,
      {
        id: 'discovery-export',
        sourceFamily: 'discovery_diagnostics',
        state: 'not_supplied' as const,
        limitations: ['Synthetic current run records the source as not supplied rather than unavailable.'],
      },
      baseReceipts[2]!,
    ];
    const pkg = await composeManagedServiceRunPackage(
      evidence,
      review,
      alpha,
      {
        workspaceRequest,
        generatedAt: '2026-10-02T12:35:00.000Z',
        runPeriod: {
          start: '2026-10-02T00:00:00.000Z',
          end: '2026-10-02T12:05:00.000Z',
        },
        policy: {
          id: 'release-018-preview-run-policy',
          version: '1.0.0',
          maxReceipts: 16,
          maxPriorAttentionIds: 128,
        },
        receipts: currentReceipts,
        priorRun: prior,
        customerReportRequest: reportRequest,
      },
    );

    for (const file of pkg.files) {
      writeFileSync(resolve(artifactDirectory, file.filename), file.content, {
        encoding: 'utf8',
        flag: 'wx',
      });
    }
    writeFileSync(resolve(artifactDirectory, 'package-manifest.json'), pkg.manifestJson, {
      encoding: 'utf8',
      flag: 'wx',
    });

    const packageBytes = pkg.files.reduce(
      (total, file) => total + Buffer.byteLength(file.content, 'utf8'),
      Buffer.byteLength(pkg.manifestJson, 'utf8'),
    );
    console.log(
      'Generated synthetic Release 0.18 service run: ' +
      'run=' + pkg.run.id + '; ' +
      'workspace=' + pkg.workspace.id + '; ' +
      'report=' + (pkg.report?.id ?? 'none') + '; ' +
      'package=' + pkg.manifest.id + '; ' +
      String(pkg.manifest.entries.length) + ' payload file(s); ' +
      String(packageBytes) + ' total UTF-8 bytes; ' +
      String(pkg.run.receipts.length) + ' receipt(s); ' +
      'prior=' + (pkg.run.priorComparison?.priorRunId ?? 'none') + '; ' +
      'decisionReadiness=' + (pkg.run.followUp.readiness ?? 'not-supplied') + '; ' +
      'WQT minor3 SiteOne changed=' + String(siteOneDelta.summary.changed) + '; ' +
      'WQT SiteOne observations=' + String(currentSnapshots[0].observations.length) + '; ' +
      'WQT Lighthouse observations=' + String(currentSnapshots[1].observations.length),
    );
  } finally {
    review.close();
    evidence.close();
    for (const suffix of ['', '-shm', '-wal']) {
      rmSync(databasePath + suffix, { force: true });
    }
  }
}

await generate();
