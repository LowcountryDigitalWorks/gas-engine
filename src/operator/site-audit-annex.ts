import {
  adaptWqtNormalizedEvidence,
  type WqtAdapterConfig,
  type WqtProviderId,
} from '../adapters/wqt.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { CustomerServiceReport } from './customer-report.js';

/**
 * This is an optional, internal presentation annex, NOT a canonical WQT schema,
 * scored site audit, customer-delivery artifact, or new trusted source.
 */
export const MAX_SITE_AUDIT_SELECTIONS = 3;
const MAX_EXCERPT = 240;

export interface SiteAuditSelection {
  readonly provider: WqtProviderId;
  readonly code: string;
}
export interface SiteAuditSourceStatus {
  readonly provider: WqtProviderId;
  readonly availability: string;
  readonly version: string | null;
  readonly reportedAt: string | null;
  readonly observationCount: number;
}
export interface SiteAuditEvidenceItem {
  readonly provider: WqtProviderId;
  readonly code: string;
  readonly sourceStatus: string | null;
  readonly sourceText: string | null;
  readonly sourceMode: string | null;
  /** Original Lighthouse 0..1 score only for binary/numeric modes; never an LDW score. */
  readonly sourceScore: number | null;
  readonly sourceDisplay: string | null;
  readonly sourceFacts: readonly Readonly<{
    id: string;
    valueType: string;
    value: number | string | boolean | null;
    unit: string | null;
  }>[];
}
export interface SiteAuditAnnex {
  readonly id: string;
  readonly reportId: string;
  readonly siteId: string;
  readonly target: string;
  readonly wqtSiteId: string;
  readonly inputSha256: string;
  readonly observedAt: string;
  readonly sources: readonly SiteAuditSourceStatus[];
  readonly selected: readonly SiteAuditEvidenceItem[];
  readonly limitations: readonly string[];
}

interface SourceFact {
  id: string;
  valueType: 'number' | 'text' | 'boolean';
  value: number | string | boolean | null;
  unit?: string;
}
interface SourceObservation {
  source: WqtProviderId;
  code: string;
  sourceStatus?: string | null;
  message?: string | null;
  facts?: SourceFact[];
  title?: string | null;
  scoreDisplayMode?: string | null;
  score?: number | null;
  displayValue?: string | null;
}
interface AcceptedWqtMinor3 {
  schemaMinorVersion: number;
  siteId: string;
  target: string;
  sources: {
    siteone: { version: string | null; executedAt: string | null; observations: SourceObservation[] };
    lighthouse: { version: string; fetchTime: string | null; observations: SourceObservation[] };
  };
}

function excerpt(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  // Bound provider-controlled display text; whitespace folding is presentation only.
  const compact = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return compact.length > MAX_EXCERPT ? compact.slice(0, MAX_EXCERPT) + '…' : compact || null;
}

function validateSelections(value: readonly SiteAuditSelection[]): void {
  if (!Array.isArray(value) || value.length > MAX_SITE_AUDIT_SELECTIONS) {
    throw new Error('Site audit annex supports zero to three human-selected exact source observations.');
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || Object.keys(item).sort().join(',') !== 'code,provider'
        || (item.provider !== 'siteone' && item.provider !== 'lighthouse')
        || typeof item.code !== 'string' || item.code.length < 1 || item.code.length > 16_384) {
      throw new Error('Site audit annex selection must be an exact source provider/code pair.');
    }
    const key = item.provider + ':' + item.code;
    if (seen.has(key)) throw new Error('Site audit annex selection contains a duplicate source observation.');
    seen.add(key);
  }
}

/** Caller supplies an already-assembled trusted report, original WQT bytes and separate trusted adapter config. */
export function composeSiteAuditAnnex(
  report: CustomerServiceReport,
  normalizedWqtBytes: Uint8Array,
  trustedConfig: WqtAdapterConfig,
  selections: readonly SiteAuditSelection[],
): SiteAuditAnnex {
  if (report.context.siteId !== trustedConfig.scope.siteId
      || report.context.target !== trustedConfig.expectedTargetOrigin) {
    throw new Error('Site audit annex report site or target does not match separately trusted WQT scope.');
  }
  validateSelections(selections);

  // Reuse the accepted G.A.S. WQT normalizer/authority/byte-size/schema validation; never
  // use unchecked original source bytes as proof of successful provider collection.
  const accepted = adaptWqtNormalizedEvidence(normalizedWqtBytes, trustedConfig);
  const artifact = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(normalizedWqtBytes)) as AcceptedWqtMinor3;
  if (artifact.schemaMinorVersion !== 3) {
    throw new Error('Site audit annex requires accepted WQT minor3 semantics.');
  }
  const providers: readonly WqtProviderId[] = ['siteone', 'lighthouse'];
  const sources: SiteAuditSourceStatus[] = providers.map((provider) => {
    const source = artifact.sources[provider];
    return {
      provider,
      availability: trustedConfig.availability[provider].state,
      version: source.version,
      reportedAt: provider === 'siteone'
        ? excerpt(artifact.sources.siteone.executedAt) : excerpt(artifact.sources.lighthouse.fetchTime),
      observationCount: source.observations.length,
    };
  });

  const selected: SiteAuditEvidenceItem[] = selections.map((selection) => {
    if (trustedConfig.availability[selection.provider].state !== 'available') {
      throw new Error('Site audit annex cannot select from an unavailable WQT source.');
    }
    const observation = artifact.sources[selection.provider].observations
      .find((candidate) => candidate.code === selection.code);
    if (observation === undefined) throw new Error('Site audit annex selection was not found in accepted WQT evidence.');
    const scored = selection.provider === 'lighthouse'
      && (observation.scoreDisplayMode === 'binary' || observation.scoreDisplayMode === 'numeric');
    const sourceScore = scored && typeof observation.score === 'number'
      && Number.isFinite(observation.score) && observation.score >= 0 && observation.score <= 1
      ? observation.score : null;
    return {
      provider: selection.provider,
      code: selection.code,
      sourceStatus: selection.provider === 'siteone' ? excerpt(observation.sourceStatus) : null,
      sourceText: excerpt(selection.provider === 'siteone' ? observation.message : observation.title),
      sourceMode: selection.provider === 'lighthouse' ? excerpt(observation.scoreDisplayMode) : null,
      sourceScore,
      sourceDisplay: selection.provider === 'lighthouse' ? excerpt(observation.displayValue) : null,
      sourceFacts: selection.provider === 'siteone' ? (observation.facts ?? []).map((fact) => ({
        id: fact.id, valueType: fact.valueType,
        value: fact.valueType === 'text' ? excerpt(fact.value as string | null) : fact.value,
        unit: fact.unit ?? null,
      })) : [],
    };
  });
  const body = {
    reportId: report.id,
    siteId: report.context.siteId,
    target: report.context.target,
    wqtSiteId: artifact.siteId,
    inputSha256: accepted.inputSha256,
    observedAt: trustedConfig.timing.observedAt,
    sources,
    selected,
    limitations: [
      'LDW internal review only: not approved for customer delivery, automated action or a technical health grade.',
      'Source-native Lighthouse scores, SiteOne statuses and typed facts are observations, not LDW severity, priority or ranking impact.',
      'WQT source timestamps and this customer-report period are not independently verified as one synchronized reporting window.',
      'Unavailable sources, unselected observations and missing source values are not proof of healthy or failed conditions.',
    ],
  };
  return { ...body, id: 'site-audit-annex:' + hashCanonicalJson(body) };
}
