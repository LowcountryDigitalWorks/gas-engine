import { z } from 'zod';
import { identifier, reason, scope as scopeSchema, timestamp } from '../contracts/primitives.js';

/**
 * Internal-only reporting seam. Records are supplied by an authorized caller
 * after separate site/account/provider verification. This code never reads the
 * site, queries a provider, enables tracking, or infers missing metric values.
 */
export const MEASUREMENT_READINESS_PROVIDERS = [
  'google_search_console',
  'bing_webmaster',
  'google_business_profile',
  'cloudflare_edge',
  'google_analytics_4',
  'microsoft_clarity',
  'wqt_scanner',
  'gas_local',
] as const;

export const MEASUREMENT_READINESS_STATES = [
  'verified',
  'configured_no_collection_proof',
  'collection_observed',
  'blocked_by_privacy_gate',
  'source_unavailable',
  'scanner_blocked',
  'not_required',
  'unknown',
] as const;

const providerSchema = z.enum(MEASUREMENT_READINESS_PROVIDERS);
const stateSchema = z.enum(MEASUREMENT_READINESS_STATES);
const sourceSchema = z.strictObject({
  provider: providerSchema,
  state: stateSchema,
  sourceReference: identifier.optional(),
  sourceObservedAt: timestamp.optional(),
  limitation: reason.optional(),
});
const nextCheckSchema = z.strictObject({
  provider: providerSchema,
  humanCheck: z.string().min(1).max(240).regex(/\S/),
});
const requestSchema = z.strictObject({
  scope: scopeSchema,
  target: z.string().min(1).max(2048),
  evaluatedAt: timestamp,
  sources: z.array(sourceSchema).max(MEASUREMENT_READINESS_PROVIDERS.length),
  nextChecks: z.array(nextCheckSchema).max(3),
});
const trustedSchema = z.strictObject({
  scope: scopeSchema,
  target: z.string().min(1).max(2048),
});

type Source = z.infer<typeof sourceSchema>;
type NextCheck = z.infer<typeof nextCheckSchema>;

// A renderer accepts only an object composed in this process. Raw/forged or
// serialized displays cannot masquerade as verified operator output.
const verifiedReports = new WeakMap<object, MeasurementReadinessReport>();

export interface MeasurementReadinessReport {
  readonly scope: z.infer<typeof scopeSchema>;
  readonly target: string;
  readonly evaluatedAt: string;
  readonly sources: readonly Source[];
  readonly nextChecks: readonly NextCheck[];
}

export class MeasurementReadinessError extends Error {
  constructor(readonly code: 'invalid_request' | 'scope_mismatch' | 'target_mismatch' | 'bound_exceeded') {
    super('Measurement readiness ' + code.replaceAll('_', ' ') + '.');
    this.name = 'MeasurementReadinessError';
  }
}

function canonicalHttpsOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.pathname !== '/' ||
      !url.hostname ||
      (value !== url.origin && value !== url.origin + '/')
    ) throw new Error('not canonical');
    return url.origin;
  } catch {
    throw new MeasurementReadinessError('invalid_request');
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function unique<T>(items: readonly T[]): boolean {
  return new Set(items).size === items.length;
}

/** Scope/site identity comes from a separate trusted caller; request is never authority. */
export function composeMeasurementReadiness(
  trustedInput: unknown,
  requestInput: unknown,
): MeasurementReadinessReport {
  const trustedResult = trustedSchema.safeParse(trustedInput);
  const requestResult = requestSchema.safeParse(requestInput);
  if (!trustedResult.success || !requestResult.success) {
    throw new MeasurementReadinessError('invalid_request');
  }
  const trusted = trustedResult.data;
  const request = requestResult.data;
  const rawBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (rawBytes > 32_768) throw new MeasurementReadinessError('bound_exceeded');

  const trustedTarget = canonicalHttpsOrigin(trusted.target);
  const target = canonicalHttpsOrigin(request.target);
  if (
    trusted.scope.tenantId !== request.scope.tenantId ||
    trusted.scope.siteId !== request.scope.siteId ||
    trusted.scope.siteScopeRevisionId !== request.scope.siteScopeRevisionId
  ) throw new MeasurementReadinessError('scope_mismatch');
  if (trustedTarget !== target) throw new MeasurementReadinessError('target_mismatch');

  if (
    !unique(request.sources.map((item) => item.provider)) ||
    !unique(request.nextChecks.map((item) => item.provider))
  ) throw new MeasurementReadinessError('invalid_request');

  for (const entry of request.sources) {
    if (
      entry.state === 'collection_observed' &&
      (entry.sourceReference === undefined || entry.sourceObservedAt === undefined)
    ) throw new MeasurementReadinessError('invalid_request');
    if (
      entry.state === 'blocked_by_privacy_gate' &&
      entry.provider !== 'google_analytics_4' &&
      entry.provider !== 'microsoft_clarity'
    ) throw new MeasurementReadinessError('invalid_request');
    if (entry.state === 'scanner_blocked' && entry.provider !== 'wqt_scanner') {
      throw new MeasurementReadinessError('invalid_request');
    }
    if (
      (entry.state === 'source_unavailable' ||
        entry.state === 'scanner_blocked' ||
        entry.state === 'blocked_by_privacy_gate') &&
      entry.limitation === undefined
    ) throw new MeasurementReadinessError('invalid_request');
    if (entry.sourceObservedAt !== undefined &&
        entry.sourceObservedAt > request.evaluatedAt) {
      throw new MeasurementReadinessError('invalid_request');
    }
  }

  const byProvider = new Map(request.sources.map((entry) => [entry.provider, entry] as const));
  const sources: Source[] = MEASUREMENT_READINESS_PROVIDERS.map((provider) =>
    byProvider.get(provider) ?? {
      provider,
      state: 'unknown',
      limitation: 'No trusted provider status supplied; absence is not an observed zero.',
    });
  const finalized = Object.freeze({
    scope: Object.freeze({ ...request.scope }),
    target,
    evaluatedAt: request.evaluatedAt,
    sources: Object.freeze(sources.map((source) => Object.freeze({ ...source }))),
    nextChecks: Object.freeze(request.nextChecks.map((check) => Object.freeze({ ...check }))),
  });
  verifiedReports.set(finalized, structuredClone(finalized));
  return finalized;
}

/**
 * Bounded static HTML fragment, not a page, live audit, signed artifact or
 * client-ready report. Revalidation prevents accidental type-only bypass.
 */
export function renderMeasurementReadinessHtml(reportInput: unknown): string {
  if (reportInput === null || typeof reportInput !== 'object') {
    throw new MeasurementReadinessError('invalid_request');
  }
  const trustedSnapshot = verifiedReports.get(reportInput);
  if (trustedSnapshot === undefined) throw new MeasurementReadinessError('invalid_request');
  const reportResult = z.strictObject({
    scope: scopeSchema,
    target: z.string(),
    evaluatedAt: timestamp,
    sources: z.array(sourceSchema).length(MEASUREMENT_READINESS_PROVIDERS.length),
    nextChecks: z.array(nextCheckSchema).max(3),
  }).safeParse(structuredClone(trustedSnapshot));
  if (!reportResult.success) throw new MeasurementReadinessError('invalid_request');
  const report = reportResult.data;
  const canonical = canonicalHttpsOrigin(report.target);
  if (canonical !== report.target ||
      report.sources.some((row, index) => row.provider !== MEASUREMENT_READINESS_PROVIDERS[index])) {
    throw new MeasurementReadinessError('invalid_request');
  }
  const human = report.nextChecks.length === 0
    ? '<p>No human follow-up selected.</p>'
    : '<ol>' + report.nextChecks.map((item) =>
      '<li><strong>' + escapeHtml(item.provider) + ':</strong> ' +
      escapeHtml(item.humanCheck) + '</li>').join('') + '</ol>';
  const rows = report.sources.map((item) => '<tr><th scope="row">' +
    escapeHtml(item.provider.replaceAll('_', ' ')) + '</th><td>' +
    escapeHtml(item.state.replaceAll('_', ' ')) + '</td><td>' +
    escapeHtml(item.sourceObservedAt ?? 'Not evidenced') + '</td><td>' +
    escapeHtml(item.sourceReference ?? 'No source reference supplied') + '</td><td>' +
    escapeHtml(item.limitation ?? 'No limitation supplied; not a health or outcome claim.') +
    '</td></tr>').join('');

  const html = '<section class="measurement-readiness" aria-labelledby="measurement-readiness-title">' +
    '<h2 id="measurement-readiness-title">Per-site measurement readiness — internal review only</h2>' +
    '<p>Site: ' + escapeHtml(report.scope.siteId) + ' · ' + escapeHtml(report.target) +
    '. Evaluated: ' + escapeHtml(report.evaluatedAt) +
    '. Statuses are trusted caller declarations, not live provider probes or visit totals.</p>' +
    '<div class="table-wrap"><table><caption>Separate source status and missingness</caption>' +
    '<thead><tr><th scope="col">Provider</th><th scope="col">State</th>' +
    '<th scope="col">Evidence time</th><th scope="col">Source reference</th>' +
    '<th scope="col">Limitations</th></tr></thead><tbody>' + rows +
    '</tbody></table></div><h3>Human-selected next checks (not automatic actions)</h3>' +
    human + '<p>Search Console verification, Cloudflare requests, GA4 sessions, Clarity replay and scanner results are not interchangeable. Unknown is not zero.</p></section>';
  if (Buffer.byteLength(html, 'utf8') > 48_000) {
    throw new MeasurementReadinessError('bound_exceeded');
  }
  return html;
}
