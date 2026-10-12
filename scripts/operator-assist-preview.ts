import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createOperatorAssistPacket,
  serializeOperatorAssistPacketJson,
  serializeValidatedOperatorAssistAdvisoryJson,
  validateOperatorAssistAdvisory,
} from '../src/operator/operator-assist.js';
import { renderOperatorAssistAdvisoryHtml } from '../src/operator/operator-assist-html.js';
import { alpha } from '../tests/persistence/helpers.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from '../tests/operator/service-brief-fixtures.js';

const artifactDirectory = resolve('local-artifacts');
const databasePath = resolve(artifactDirectory, 'release-0.21-operator-assist-preview.sqlite');
const packetPath = resolve(artifactDirectory, 'release-0.21-operator-assist-packet.json');
const advisoryPath = resolve(artifactDirectory, 'release-0.21-operator-assist-advisory.json');
const htmlPath = resolve(artifactDirectory, 'release-0.21-operator-assist-advisory.html');

function primaryRef(packet: Awaited<ReturnType<typeof createOperatorAssistPacket>>, index: number): string {
  const attention = packet.attentionItems[index];
  if (attention === undefined) throw new Error('Synthetic Release 0.21 preview requires multiple attention items.');
  const ref = packet.evidenceReferences.find((entry) => entry.kind === 'attention' && entry.attentionId === attention.attentionId);
  if (ref === undefined) throw new Error('Synthetic Release 0.21 attention reference is missing.');
  return ref.id;
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [databasePath, databasePath + '-shm', databasePath + '-wal', packetPath, advisoryPath, htmlPath]) {
    rmSync(path, { force: true });
  }

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const modules = serviceBriefSearchModules('https://example.test', serviceBriefScope);
    const packet = await createOperatorAssistPacket(evidence, review, alpha, {
      serviceBriefRequest: {
        scope: serviceBriefScope,
        trustedTarget: 'https://example.test',
        generatedAt: '2026-10-07T20:00:00.000Z',
        policy: {
          id: 'release-021-preview-service-brief',
          version: '1.0.0',
          maxAttentionItems: 128,
          maxPageIndexEntries: 128,
          maxReferencesPerPage: 32,
          maxDetailedRecommendationHistories: 0,
          maxSearchChanges: 8,
          maxPageFocusReports: 8,
        },
        searchAnalytics: modules.searchAnalytics,
        searchChanges: modules.searchChanges,
        pageFocus: modules.pageFocus,
      },
      policy: {
        id: 'release-021-preview-assist',
        version: '1.0.0',
        maxAttentionItems: 128,
        maxEvidenceReferences: 512,
      },
    });
    if (packet.attentionItems.length < 2) throw new Error('Synthetic Release 0.21 preview did not produce multiple attention items.');

    const first = packet.attentionItems[0]!;
    const second = packet.attentionItems[1]!;
    const firstRef = primaryRef(packet, 0);
    const secondRef = primaryRef(packet, 1);
    const firstContextRef = first.evidenceRefs.find((id) => id !== firstRef);
    if (firstContextRef === undefined) throw new Error('Synthetic Release 0.21 preview needs a context reference.');
    const hostile = `<script>alert("synthetic & inert")</script><svg onload='synthetic'> https://example.test/not-an-action?a=1&b=2`;

    const advisory = validateOperatorAssistAdvisory(packet, {
      version: '0.21.0',
      assistPacketId: packet.id,
      authorityBoundary: 'untrusted_external_advisory_human_review_required',
      orderingSemantics: 'external_suggested_review_order_not_canonical_priority',
      provenance: {
        reviewerKind: 'ai',
        providerLabel: `synthetic-provider ${hostile}`,
        modelLabel: `synthetic-model ${hostile}`,
        reviewedAt: '2026-10-07T20:05:00.000Z',
        method: { label: 'synthetic-offline-fixture-only', version: '1.0.0' },
      },
      summary: `Synthetic external advisory summary ${hostile}. It is inert text, not evidence truth.`,
      reviewCandidates: [
        {
          attentionId: first.attentionId,
          rationale: `Synthetic rationale ${hostile}. Human review is required.`,
          supportingEvidenceRefs: [firstRef],
          contradictingEvidenceRefs: [firstContextRef],
          uncertainty: 'High uncertainty: exact packet grounding does not establish causality, impact, or priority.',
          needsHumanValidation: true,
        },
        {
          attentionId: second.attentionId,
          rationale: 'Synthetic second candidate demonstrates a suggested review order only.',
          supportingEvidenceRefs: [secondRef],
          uncertainty: 'Interpretation remains advisory and requires independent human validation.',
          needsHumanValidation: true,
        },
      ],
      hypotheses: [{
        text: `Synthetic hypothesis ${hostile}; this is not a causal finding.`,
        supportingEvidenceRefs: [firstRef],
        contradictingEvidenceRefs: [secondRef],
        evidenceNeededToConfirmOrDisconfirm: 'Human reviewer should inspect independent source context that could disconfirm this synthetic hypothesis.',
        uncertainty: 'High uncertainty because the packet is intentionally bounded and does not establish business impact.',
        needsHumanValidation: true,
      }],
      questionsForHuman: ['Does independent domain context justify further investigation before any recommendation is authored?'],
      draftRecommendationOptions: [{
        text: `Synthetic draft option ${hostile}; do not execute or convert automatically.`,
        supportingEvidenceRefs: [firstRef],
        caveats: ['External draft only; a human must independently author, adopt, or modify any Release 0.8 recommendation through the accepted Release 0.16 path.'],
        needsHumanValidation: true,
      }],
      limitations: ['Synthetic preview uses no real AI model, no customer/private evidence, no provider network, and no production action authority.'],
    });

    const packetJson = serializeOperatorAssistPacketJson(packet);
    const advisoryJson = serializeValidatedOperatorAssistAdvisoryJson(packet, advisory);
    const html = renderOperatorAssistAdvisoryHtml(packet, advisory);
    writeFileSync(packetPath, packetJson, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(advisoryPath, advisoryJson, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(htmlPath, html, { encoding: 'utf8', flag: 'wx' });
    console.log(`Release 0.21 assist packet identity: ${packet.id}`);
    console.log(`Release 0.21 source service brief identity: ${packet.sourceServiceBriefId}`);
    console.log(`Release 0.21 validated advisory identity: ${advisory.id}`);
    console.log(`Release 0.21 included attention items: ${packet.attentionItems.length}; evidence refs: ${packet.evidenceReferences.length}`);
    console.log(`Release 0.21 packet JSON bytes: ${Buffer.byteLength(packetJson, 'utf8')}; advisory JSON bytes: ${Buffer.byteLength(advisoryJson, 'utf8')}; advisory HTML bytes: ${Buffer.byteLength(html, 'utf8')}`);
    console.log('Release 0.21 preview proves synthetic packet -> untrusted external advisory -> exact-reference validation -> escaped read-only HTML -> HUMAN Release 0.16 next-step boundary; no model/network call performed.');
  } finally {
    review.close();
    evidence.close();
    for (const path of [databasePath, databasePath + '-shm', databasePath + '-wal']) rmSync(path, { force: true });
  }
}

await generate();
