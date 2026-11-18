import { z } from 'zod';

/**
 * Pure local preview of three 2026 Search Analytics API query shapes.
 * Never authenticates, calls Google, collects rows or mints tenant authority.
 */
export const GSC_QUERY_PREVIEW_MAX_ROWS = 384 as const;
export const GSC_QUERY_PREVIEW_MAX_DAYS = 31 as const;
export const GSC_BRANDED_EARLIEST_DATE = '2026-02-21' as const;

const deviceSchema = z.enum(['DESKTOP', 'MOBILE', 'TABLET']);
const profileSchema = z.enum(['branded_split', 'multimodal_pages', 'regional_web']);
const previewSchema = z.strictObject({
  property: z.string().min(1).max(255),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profile: profileSchema,
  countries: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1).max(8).optional(),
  devices: z.array(deviceSchema).min(1).max(3).optional(),
});

export type GscQueryPreviewProfile = z.infer<typeof profileSchema>;
type GscQueryDimension = 'brandedClassification' | 'page' | 'country' | 'device';

export interface GscQueryPreviewBody {
  readonly startDate: string;
  readonly endDate: string;
  readonly type: 'web' | 'webMultimodal';
  readonly dimensions: readonly GscQueryDimension[];
  readonly dimensionFilterGroups: readonly Readonly<{
    groupType: 'and';
    filterLists: readonly Readonly<{
      dimension: 'country' | 'device';
      expressions: readonly string[];
    }>[];
  }>[];
  readonly aggregationType: 'auto';
  readonly dataState: 'final';
  readonly rowLimit: typeof GSC_QUERY_PREVIEW_MAX_ROWS;
  readonly startRow: 0;
}

export interface GscQueryPreview {
  readonly profile: GscQueryPreviewProfile;
  /** Unverified operator selection, NOT property ownership or tenant authority. */
  readonly property: string;
  readonly body: GscQueryPreviewBody;
  readonly sourceVerified: false;
  readonly providerRowsCollected: false;
  readonly networkAuthorized: false;
  readonly acceptedSearchAnalyticsAdapterCompatible: false;
}

export class GscQueryPreviewError extends Error {
  override name = 'GscQueryPreviewError';
  constructor() {
    super('Invalid or unsupported offline GSC query preview.');
  }
}

function canonicalProperty(value: string): boolean {
  if (value.startsWith('sc-domain:')) {
    const domain = value.slice('sc-domain:'.length);
    return domain.length <= 253
      && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.port === ''
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.hostname.includes('.')
      && parsed.pathname === '/'
      && (value === parsed.origin || value === parsed.origin + '/');
  } catch {
    return false;
  }
}

function dateUtc(value: string): number {
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date.getTime()
    : Number.NaN;
}

function sortedUnique(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (new Set(values).size !== values.length) throw new GscQueryPreviewError();
  return Object.freeze([...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Build an unexecuted request-body preview. A separate authorized collector
 * would have to prove property access, quota, and source completeness first.
 */
export function previewGscSearchAnalyticsQuery(input: unknown): GscQueryPreview {
  const result = previewSchema.safeParse(input);
  if (!result.success) throw new GscQueryPreviewError();
  const request = result.data;
  if (!canonicalProperty(request.property)) throw new GscQueryPreviewError();

  const from = dateUtc(request.startDate);
  const to = dateUtc(request.endDate);
  if (!Number.isFinite(from)
      || !Number.isFinite(to)
      || to < from
      || (to - from) / 86_400_000 + 1 > GSC_QUERY_PREVIEW_MAX_DAYS
      || (request.profile === 'branded_split'
          && request.startDate < GSC_BRANDED_EARLIEST_DATE)) {
    throw new GscQueryPreviewError();
  }
  const countries = sortedUnique(request.countries);
  const devices = sortedUnique(request.devices);
  if (request.profile === 'regional_web'
      && countries === undefined && devices === undefined) {
    throw new GscQueryPreviewError();
  }
  const dimensionsSource: GscQueryDimension[] =
    request.profile === 'branded_split'
      ? ['brandedClassification']
      : request.profile === 'multimodal_pages'
        ? ['page']
        : ['country', 'device'];
  const dimensions = Object.freeze(dimensionsSource);

  const filterLists: {
    readonly dimension: 'country' | 'device';
    readonly expressions: readonly string[];
  }[] = [];
  if (countries !== undefined) filterLists.push(Object.freeze({ dimension: 'country' as const, expressions: countries }));
  if (devices !== undefined) filterLists.push(Object.freeze({ dimension: 'device' as const, expressions: devices }));
  const dimensionFilterGroups: GscQueryPreviewBody['dimensionFilterGroups'] = Object.freeze(
    filterLists.length === 0 ? [] : [Object.freeze({
      groupType: 'and' as const,
      filterLists: Object.freeze(filterLists),
    })],
  );
  const body: GscQueryPreviewBody = Object.freeze({
    startDate: request.startDate,
    endDate: request.endDate,
    type: request.profile === 'multimodal_pages' ? 'webMultimodal' as const : 'web' as const,
    dimensions,
    dimensionFilterGroups,
    aggregationType: 'auto' as const,
    dataState: 'final' as const,
    rowLimit: GSC_QUERY_PREVIEW_MAX_ROWS,
    startRow: 0 as const,
  });
  return Object.freeze({
    profile: request.profile,
    property: request.property,
    body,
    sourceVerified: false as const,
    providerRowsCollected: false as const,
    networkAuthorized: false as const,
    acceptedSearchAnalyticsAdapterCompatible: false as const,
  });
}
