import { z } from 'zod';
import {
  availability as availabilitySchema,
  identifier,
  scope as scopeSchema,
  timestamp,
} from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import {
  canonicalJson,
  hashCanonicalJson,
  MAX_HASH_INPUT_BYTES,
  sha256Bytes,
} from '../lib/canonical-json.js';
import type { CollectionBatch, Scope } from '../persistence/repository.js';
import { INGESTION_PART_BOUNDS, parseCollectionBatch } from '../persistence/validation.js';

export const DOMSCAN_INPUT_SCHEMA_VERSION = 'ldw.wqt-domscan-sidecar.v1' as const;
export const DOMSCAN_PROVIDER_ID = 'domscan' as const;
export const DOMSCAN_ADAPTER_ID = 'ldw-domscan-sidecar-adapter' as const;
export const DOMSCAN_MAPPING_VERSION = '1.0.0' as const;
export const DOMSCAN_SOURCE_SCHEMA_ID = 'ldw.wqt-domscan-sidecar' as const;
export const DOMSCAN_SOURCE_SCHEMA_VERSION = 'v1' as const;
export const DOMSCAN_METHOD_REVISION = 1 as const;
export const MAX_DOMSCAN_INPUT_BYTES = MAX_HASH_INPUT_BYTES;

export const DOMSCAN_DNS_CHECK_CODES = Object.freeze([
  'spf',
  'dkim',
  'dmarc',
  'dnssec',
  'caa',
  'mta_sts',
  'tls_rpt',
  'zone_transfer',
] as const);

/** Provider agent_readiness signal keys (WQT sidecar v1). */
export const DOMSCAN_AGENT_SIGNAL_CODES = Object.freeze([
  'webmcp',
  'remote_mcp',
  'openapi',
  'llms_txt',
  'api_catalog',
  'mcp_server_card',
  'agent_skills',
  'oauth',
  'markdown',
  'web_bot_auth',
  'sitemap_markdown',
  'agent_guide',
] as const);

export type DomscanEndpoint = 'dns_security' | 'agent_readiness';
export type DomscanClassification =
  | 'present'
  | 'absent'
  | 'unknown'
  | 'not_detected'
  | 'not_applicable'
  | 'inconclusive';

export type DomscanAdapterErrorCode =
  | 'invalid_input'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'invalid_source'
  | 'unsupported_schema'
  | 'unsupported_endpoint'
  | 'configuration_mismatch'
  | 'duplicate_source_id'
  | 'input_too_large'
  | 'policy_violation'
  | 'invalid_output'
  | 'row_too_large'
  | 'too_many_parts'
  | 'incompatible_collections';

export class DomscanAdapterError extends Error {
  constructor(
    readonly code: DomscanAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomscanAdapterError';
  }
}

export interface DomscanAdapterConfig {
  readonly scope: Scope;
  readonly expectedSiteId: string;
  readonly expectedOrigin: string;
  readonly expectedEndpoint: DomscanEndpoint;
  readonly providerConnectionId: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface DomscanAdaptedRow {
  readonly endpoint: DomscanEndpoint;
  readonly code: string;
  readonly classification: DomscanClassification;
  readonly rowIdentity: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<Record<string, string>>;
}

export interface DomscanSemantics {
  readonly endpoint: DomscanEndpoint;
  readonly trustedOrigin: string;
  readonly artifactOrigin: string;
  readonly siteId: string;
  readonly inputObservedAt: string;
  readonly outcome?: string;
  readonly providerMethodEstablished: false;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface DomscanAdaptationResult {
  readonly providerId: typeof DOMSCAN_PROVIDER_ID;
  readonly endpoint: DomscanEndpoint;
  readonly inputSha256: string;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly semantics: DomscanSemantics;
  readonly rows: readonly DomscanAdaptedRow[];
  readonly batches: readonly CollectionBatch[];
}

const classificationSchema = z.enum([
  'present',
  'absent',
  'unknown',
  'not_detected',
  'not_applicable',
  'inconclusive',
]);

const gatePolicySchema = z.object({
  qualityThresholdsApplied: z.literal(false),
  domscanSidecar: z.literal(true),
}).strict();

const dnsCheckSchema = z.object({
  code: z.enum(DOMSCAN_DNS_CHECK_CODES),
  classification: classificationSchema,
  valid: z.boolean().optional(),
  policy: z.string().min(1).max(32).optional(),
}).strict();

const agentSignalSchema = z.object({
  code: z.enum(DOMSCAN_AGENT_SIGNAL_CODES),
  classification: classificationSchema,
  validation: z.string().min(1).max(64).optional(),
  method: z.string().min(1).max(64).optional(),
  caveats: z.array(z.string().min(1).max(64)).max(8).optional(),
}).strict();

const sourceNativeSchema = z.object({
  agentReadinessScore: z.number().int().min(0).max(100),
}).strict();

const artifactBaseSchema = z.object({
  schemaVersion: z.literal(DOMSCAN_INPUT_SCHEMA_VERSION),
  provider: z.literal(DOMSCAN_PROVIDER_ID),
  evidenceOnly: z.literal(true),
  gatePolicy: gatePolicySchema,
  siteId: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  origin: z.string().min(1).max(2_048),
  endpoint: z.enum(['dns_security', 'agent_readiness']),
  inputObservedAt: timestamp,
}).strict();

const dnsArtifactSchema = artifactBaseSchema.extend({
  endpoint: z.literal('dns_security'),
  checks: z.array(dnsCheckSchema).length(DOMSCAN_DNS_CHECK_CODES.length),
}).strict();

const agentArtifactSchema = artifactBaseSchema.extend({
  endpoint: z.literal('agent_readiness'),
  requestedRootUrl: z.string().min(1).max(2_048),
  finalRootUrl: z.string().min(1).max(2_048),
  outcome: z.string().min(1).max(32),
  signals: z.array(agentSignalSchema).length(DOMSCAN_AGENT_SIGNAL_CODES.length),
  sourceNative: sourceNativeSchema.optional(),
}).strict();

type DnsArtifact = z.infer<typeof dnsArtifactSchema>;
type AgentArtifact = z.infer<typeof agentArtifactSchema>;
type DomscanArtifact = DnsArtifact | AgentArtifact;

const configSchema = z.object({
  scope: scopeSchema,
  expectedSiteId: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
  expectedOrigin: z.string().min(1).max(2_048),
  expectedEndpoint: z.enum(['dns_security', 'agent_readiness']),
  providerConnectionId: identifier,
  collectedAt: timestamp,
  receivedAt: timestamp,
  availability: availabilitySchema,
}).strict();

type ParsedConfig = z.infer<typeof configSchema>;

type ObservationValue =
  | { readonly state: 'observed'; readonly value: { readonly type: 'text'; readonly value: string } }
  | { readonly state: 'observed'; readonly value: { readonly type: 'boolean'; readonly value: boolean } }
  | { readonly state: 'unknown'; readonly reason: string };

interface ObservationSpec {
  readonly metricId: string;
  readonly unit: string;
  readonly valueType: 'text' | 'boolean';
  readonly value: ObservationValue;
}

interface PreparedRow {
  readonly row: DomscanAdaptedRow;
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}

function fail(code: DomscanAdapterErrorCode, message: string): never {
  throw new DomscanAdapterError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function derivedIdentifier(prefix: string, material: unknown): string {
  return `${prefix}:${hashCanonicalJson(material)}`;
}

function validateHttpsOrigin(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('invalid_source', `${label} must be an absolute HTTPS origin URL.`);
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    fail('invalid_source', `${label} must use HTTPS without credentials.`);
  }
  if (url.port !== '' && url.port !== '443') {
    fail('invalid_source', `${label} must not specify a non-default port.`);
  }
  if (url.pathname !== '' && url.pathname !== '/') {
    fail('invalid_source', `${label} must not include a path.`);
  }
  if (url.search !== '' || url.hash !== '') {
    fail('invalid_source', `${label} must not include query or hash.`);
  }
  const canonical = `https://${url.hostname}`;
  if (value !== canonical) {
    fail('invalid_source', `${label} must be the canonical HTTPS origin without path, query, hash, or trailing slash.`);
  }
}

function classificationValue(classification: DomscanClassification): ObservationValue {
  switch (classification) {
    case 'present':
    case 'absent':
    case 'not_applicable':
      return { state: 'observed', value: { type: 'text', value: classification } };
    case 'not_detected':
      return {
        state: 'unknown',
        reason: 'DomScan sidecar reports not_detected; this is a bounded method finding, not observed absence.',
      };
    case 'unknown':
      return { state: 'unknown', reason: 'DomScan sidecar reports unknown classification.' };
    case 'inconclusive':
      return { state: 'unknown', reason: 'DomScan sidecar reports inconclusive classification.' };
  }
}

function spfValidValue(
  classification: DomscanClassification,
  valid: boolean | undefined,
): ObservationValue | undefined {
  if (valid === undefined) return undefined;
  if (classification !== 'present') {
    return {
      state: 'unknown',
      reason: 'SPF valid flag is present only when DomScan classification is consistently present.',
    };
  }
  return { state: 'observed', value: { type: 'boolean', value: valid } };
}

function dmarcPolicyValue(
  classification: DomscanClassification,
  policy: string | undefined,
): ObservationValue | undefined {
  if (policy === undefined) return undefined;
  if (classification !== 'present') {
    return {
      state: 'unknown',
      reason: 'DMARC policy is emitted only when DomScan classification is consistently present.',
    };
  }
  return { state: 'observed', value: { type: 'text', value: policy } };
}

function parseInput(bytes: Uint8Array): { readonly artifact: DomscanArtifact; readonly inputSha256: string } {
  let inputSha256: string;
  try {
    inputSha256 = sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) {
      fail('input_too_large', `DomScan sidecar evidence exceeds ${MAX_DOMSCAN_INPUT_BYTES} bytes.`);
    }
    fail('invalid_input', 'DomScan sidecar input must be an ordinary Uint8Array or Buffer.');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'DomScan sidecar evidence is not valid UTF-8.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'DomScan sidecar evidence is not valid JSON.');
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'DomScan sidecar evidence root must be an object.');
  }
  const root = decoded as Record<string, unknown>;
  if (root['schemaVersion'] !== DOMSCAN_INPUT_SCHEMA_VERSION) {
    fail('unsupported_schema', `Only ${DOMSCAN_INPUT_SCHEMA_VERSION} is supported.`);
  }
  const endpoint = root['endpoint'];
  if (endpoint === 'dns_security') {
    const parsed = dnsArtifactSchema.safeParse(decoded);
    if (!parsed.success) fail('invalid_source', 'DomScan dns_security artifact is invalid or contains unsupported fields.');
    return { artifact: parsed.data, inputSha256 };
  }
  if (endpoint === 'agent_readiness') {
    const parsed = agentArtifactSchema.safeParse(decoded);
    if (!parsed.success) fail('invalid_source', 'DomScan agent_readiness artifact is invalid or contains unsupported fields.');
    return { artifact: parsed.data, inputSha256 };
  }
  fail('unsupported_endpoint', 'DomScan sidecar endpoint must be dns_security or agent_readiness.');
}

function parseConfig(input: DomscanAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted DomScan adapter configuration is invalid.');
  validateHttpsOrigin(parsed.data.expectedOrigin, 'Trusted expected origin');
  if (!(parsed.data.collectedAt <= parsed.data.receivedAt)) {
    fail('invalid_input', 'Trusted DomScan collectedAt/receivedAt ordering is invalid.');
  }
  return parsed.data;
}

function assertOrderedDnsChecks(checks: readonly z.infer<typeof dnsCheckSchema>[]): void {
  for (let index = 0; index < DOMSCAN_DNS_CHECK_CODES.length; index += 1) {
    const expected = DOMSCAN_DNS_CHECK_CODES[index]!;
    const entry = checks[index];
    if (!entry || entry.code !== expected) {
      fail('invalid_source', 'DomScan dns_security checks must appear in the accepted fixed order without duplicates.');
    }
  }
}

function assertSortedAgentSignals(signals: readonly z.infer<typeof agentSignalSchema>[]): void {
  const sorted = [...DOMSCAN_AGENT_SIGNAL_CODES].sort(asciiCompare);
  for (let index = 0; index < sorted.length; index += 1) {
    const expected = sorted[index]!;
    const entry = signals[index];
    if (!entry || entry.code !== expected) {
      fail('invalid_source', 'DomScan agent_readiness signals must be sorted by code without duplicates or omissions.');
    }
  }
}

function enforceAgentSignalSemantics(signal: z.infer<typeof agentSignalSchema>): DomscanClassification {
  if (signal.code === 'webmcp' && signal.validation === 'runtime_required') {
    return 'unknown';
  }
  return signal.classification;
}

function validateSemantics(artifact: DomscanArtifact, config: ParsedConfig): void {
  if (artifact.endpoint !== config.expectedEndpoint) {
    fail('configuration_mismatch', 'DomScan sidecar endpoint does not match trusted adapter configuration.');
  }
  if (artifact.siteId !== config.expectedSiteId) {
    fail('configuration_mismatch', 'DomScan sidecar siteId does not match trusted adapter configuration.');
  }
  validateHttpsOrigin(artifact.origin, 'Artifact origin');
  if (artifact.origin !== config.expectedOrigin) {
    fail('configuration_mismatch', 'DomScan sidecar origin does not match trusted adapter configuration.');
  }
  if (!(artifact.inputObservedAt <= config.collectedAt && config.collectedAt <= config.receivedAt)) {
    fail('invalid_source', 'DomScan source observation time must fall within the trusted collection envelope.');
  }
  if (artifact.endpoint === 'dns_security') {
    assertOrderedDnsChecks(artifact.checks);
    for (const check of artifact.checks) {
      if (check.code === 'spf' && check.valid === false && check.classification === 'absent') {
        fail('policy_violation', 'SPF valid:false cannot be paired with absent classification.');
      }
      if (check.code === 'dmarc' && check.policy !== undefined && check.classification !== 'present') {
        fail('policy_violation', 'DMARC policy requires consistent present classification.');
      }
    }
  } else {
    assertSortedAgentSignals(artifact.signals);
    if (artifact.requestedRootUrl !== `${artifact.origin}/` || artifact.finalRootUrl !== `${artifact.origin}/`) {
      fail('invalid_source', 'DomScan agent_readiness root URLs must match artifact origin host.');
    }
  }
}

function domscanMethod(endpoint: DomscanEndpoint, config: ParsedConfig): Contract<'collection'>['method'] {
  const methodId = endpoint === 'dns_security' ? 'ldw-domscan-dns-security' : 'ldw-domscan-agent-readiness';
  const configurationId = derivedIdentifier('domscan.config', {
    endpoint,
    expectedSiteId: config.expectedSiteId,
    expectedOrigin: config.expectedOrigin,
    providerConnectionId: config.providerConnectionId,
    mapping: DOMSCAN_MAPPING_VERSION,
    revision: DOMSCAN_METHOD_REVISION,
  });
  return {
    id: methodId,
    version: DOMSCAN_MAPPING_VERSION,
    configurationId,
    configurationRevision: DOMSCAN_METHOD_REVISION,
  };
}

function normalizedRows(artifact: DomscanArtifact): Array<{
  readonly code: string;
  readonly classification: DomscanClassification;
  readonly valid?: boolean;
  readonly policy?: string;
  readonly method?: string;
  readonly validation?: string;
}> {
  if (artifact.endpoint === 'dns_security') {
    return artifact.checks.map((check) => ({
      code: check.code,
      classification: check.classification,
      ...(check.valid === undefined ? {} : { valid: check.valid }),
      ...(check.policy === undefined ? {} : { policy: check.policy }),
    }));
  }
  return artifact.signals.map((signal) => ({
    code: signal.code,
    classification: enforceAgentSignalSemantics(signal),
    ...(signal.method === undefined ? {} : { method: signal.method }),
    ...(signal.validation === undefined ? {} : { validation: signal.validation }),
  }));
}

function sourceDigest(
  artifact: DomscanArtifact,
  row: ReturnType<typeof normalizedRows>[number],
): string {
  return hashCanonicalJson({
    schemaVersion: DOMSCAN_INPUT_SCHEMA_VERSION,
    endpoint: artifact.endpoint,
    siteId: artifact.siteId,
    origin: artifact.origin,
    inputObservedAt: artifact.inputObservedAt,
    ...(artifact.endpoint === 'agent_readiness' && artifact.sourceNative === undefined
      ? {}
      : artifact.endpoint === 'agent_readiness'
        ? { sourceNative: artifact.sourceNative }
        : {}),
    row,
  });
}

function rowObservations(
  endpoint: DomscanEndpoint,
  row: ReturnType<typeof normalizedRows>[number],
): readonly ObservationSpec[] {
  const specs: ObservationSpec[] = [{
    metricId: endpoint === 'dns_security' ? 'domscan-dns-check-classification' : 'domscan-agent-signal-classification',
    unit: 'state',
    valueType: 'text',
    value: classificationValue(row.classification),
  }];
  if (endpoint === 'dns_security' && row.code === 'spf') {
    const spf = spfValidValue(row.classification, row.valid);
    if (spf !== undefined) {
      specs.push({
        metricId: 'domscan-dns-spf-valid',
        unit: 'flag',
        valueType: 'boolean',
        value: spf,
      });
    }
  }
  if (endpoint === 'dns_security' && row.code === 'dmarc') {
    const dmarc = dmarcPolicyValue(row.classification, row.policy);
    if (dmarc !== undefined) {
      specs.push({
        metricId: 'domscan-dns-dmarc-policy',
        unit: 'policy',
        valueType: 'text',
        value: dmarc,
      });
    }
  }
  if (endpoint === 'agent_readiness' && row.method !== undefined) {
    specs.push({
      metricId: 'domscan-agent-signal-method',
      unit: 'method',
      valueType: 'text',
      value: { state: 'observed', value: { type: 'text', value: row.method } },
    });
  }
  return specs;
}

function makeObservation(
  spec: ObservationSpec,
  rowIdentity: string,
  rowCode: string,
  sourceId: string,
  collection: Contract<'collection'>,
  identity: Contract<'sourceRecord'>['identity'],
  integrity: Contract<'sourceRecord'>['integrity'],
  availability: Contract<'sourceRecord'>['availability'],
  siteRef: string,
): CollectionBatch['observations'][number] {
  const id = derivedIdentifier('domscan.obs', {
    collectionId: collection.id,
    rowIdentity,
    metricId: spec.metricId,
  });
  const record = parseContract('observation', {
    schemaVersion: '1.0',
    kind: 'observation',
    id,
    cohort: {
      schemaVersion: '1.0',
      kind: 'cohort',
      id: derivedIdentifier('domscan.cohort', {
        endpoint: collection.method.id,
        siteRef,
        rowIdentity,
        metricId: spec.metricId,
      }),
      revision: 1,
      context: {
        scope: collection.scope,
        subject: { kind: 'site', reference: siteRef },
        metric: {
          id: spec.metricId,
          meaningVersion: DOMSCAN_MAPPING_VERSION,
          valueType: spec.valueType,
          unit: spec.unit,
        },
        dimensions: {
          providerId: DOMSCAN_PROVIDER_ID,
          surface: `domscan:${rowCode}`,
        },
        method: collection.method,
        timeWindowRules: {
          id: 'domscan-sidecar-point',
          version: DOMSCAN_MAPPING_VERSION,
          alignment: 'point',
          durationSeconds: 0,
          timezone: 'UTC',
        },
      },
    },
    value: spec.value,
    provenance: {
      schemaVersion: '1.0',
      source: identity,
      adapter: collection.adapter,
      sourceSchema: collection.sourceSchema,
      runId: collection.id,
      sourceTime: collection.sourceTime,
      collectedAt: collection.collectedAt,
      receivedAt: collection.receivedAt,
      sourceTimezone: 'UTC',
      completeness: collection.completeness,
      integrity,
      normalization: collection.adapter,
      availability,
    },
  });
  return { sourceId, record };
}

function prepareRows(
  artifact: DomscanArtifact,
  config: ParsedConfig,
  collection: Contract<'collection'>,
): PreparedRow[] {
  const siteRef = derivedIdentifier('domscan.site', { origin: artifact.origin, siteId: artifact.siteId });
  const rows = normalizedRows(artifact);
  return rows.map((row) => {
    const rowIdentity = derivedIdentifier('domscan.row', {
      endpoint: artifact.endpoint,
      code: row.code,
    });
    const digest = sourceDigest(artifact, row);
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId: DOMSCAN_PROVIDER_ID,
      providerConnectionId: config.providerConnectionId,
      sourceRecordId: rowIdentity,
    };
    const integrity: Contract<'sourceRecord'>['integrity'] = {
      state: 'hashed',
      algorithm: 'sha256',
      representation: 'canonical_json_v1',
      digest,
    };
    const source = parseContract('sourceRecord', {
      schemaVersion: '1.0',
      kind: 'source_record',
      identity,
      integrity,
      availability: config.availability,
    });
    const sourceId = derivedIdentifier('domscan.src', {
      collectionId: collection.id,
      rowIdentity,
      digest,
    });
    const observations = rowObservations(artifact.endpoint, row).map((spec) =>
      makeObservation(spec, rowIdentity, row.code, sourceId, collection, identity, integrity, config.availability, siteRef));
    const observationIds = Object.fromEntries(
      observations.map((entry) => [entry.record.cohort.context.metric.id, entry.record.id]),
    );
    return {
      row: {
        endpoint: artifact.endpoint,
        code: row.code,
        classification: row.classification,
        rowIdentity,
        sourceId,
        sourceRecordId: rowIdentity,
        observationIds,
      },
      source: { id: sourceId, record: source },
      observations,
    };
  });
}

function packRows(
  prepared: readonly PreparedRow[],
  idempotencyKey: string,
  collection: Contract<'collection'>,
): CollectionBatch[] {
  const batch = {
    idempotencyKey,
    collection,
    part: 1,
    parts: 1,
    sources: prepared.map((item) => item.source),
    observations: prepared.flatMap((item) => item.observations),
  };
  if (prepared.length > INGESTION_PART_BOUNDS.sourcesPerPart
      || batch.observations.length > INGESTION_PART_BOUNDS.observationsPerPart) {
    fail('row_too_large', 'DomScan sidecar evidence exceeds one bounded persistence part.');
  }
  try {
    canonicalJson(batch);
  } catch (error) {
    if (error instanceof RangeError) fail('row_too_large', 'DomScan sidecar evidence exceeds canonical byte bounds.');
    throw error;
  }
  try {
    return [parseCollectionBatch(batch)];
  } catch {
    fail('invalid_output', 'Adapted DomScan evidence failed canonical collection-part validation.');
  }
}

/**
 * Pure/local adaptation of one sanitized WQT DomScan sidecar artifact (`ldw.wqt-domscan-sidecar.v1`).
 * No WQT package import, provider networking, credentials, or persistence occurs here.
 */
export function adaptDomscanSidecarEvidence(
  bytes: Uint8Array,
  trustedConfig: DomscanAdapterConfig,
): DomscanAdaptationResult {
  const { artifact, inputSha256 } = parseInput(bytes);
  const config = parseConfig(trustedConfig);
  validateSemantics(artifact, config);
  const normalized = normalizedRows(artifact);
  const method = domscanMethod(artifact.endpoint, config);
  const rowCount = normalized.length;
  const completeness: Contract<'collection'>['completeness'] = {
    state: 'complete',
    expectedCount: rowCount,
    receivedCount: rowCount,
  };
  const collectionDigest = hashCanonicalJson({
    algorithm: 'gas-domscan-sidecar-collection-v1',
    scope: config.scope,
    providerConnectionId: config.providerConnectionId,
    trustedSiteId: config.expectedSiteId,
    trustedOrigin: config.expectedOrigin,
    endpoint: artifact.endpoint,
    siteId: artifact.siteId,
    origin: artifact.origin,
    inputObservedAt: artifact.inputObservedAt,
    ...(artifact.endpoint === 'agent_readiness'
      ? {
        outcome: artifact.outcome,
        ...(artifact.sourceNative === undefined ? {} : { sourceNative: artifact.sourceNative }),
      }
      : {}),
    rows: normalized,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    method,
  });
  const collectionId = `domscan.collection:${collectionDigest}`;
  const idempotencyKey = `domscan.idempotency:${collectionDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: DOMSCAN_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: DOMSCAN_ADAPTER_ID, version: DOMSCAN_MAPPING_VERSION },
    sourceSchema: { id: DOMSCAN_SOURCE_SCHEMA_ID, version: DOMSCAN_SOURCE_SCHEMA_VERSION },
    method,
    sourceTime: { start: artifact.inputObservedAt, end: artifact.inputObservedAt },
    startedAt: artifact.inputObservedAt,
    endedAt: artifact.inputObservedAt,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    completeness,
  });
  const prepared = prepareRows(artifact, config, collection);
  const batches = packRows(prepared, idempotencyKey, collection);
  return {
    providerId: DOMSCAN_PROVIDER_ID,
    endpoint: artifact.endpoint,
    inputSha256,
    collectionId,
    idempotencyKey,
    semantics: {
      endpoint: artifact.endpoint,
      trustedOrigin: config.expectedOrigin,
      artifactOrigin: artifact.origin,
      siteId: artifact.siteId,
      inputObservedAt: artifact.inputObservedAt,
      ...(artifact.endpoint === 'agent_readiness' ? { outcome: artifact.outcome } : {}),
      providerMethodEstablished: false,
      availability: structuredClone(config.availability),
    },
    rows: prepared.map((item) => item.row),
    batches,
  };
}

export interface ValidatedDomscanWindow {
  readonly collection: Contract<'collection'>;
  readonly semantics: DomscanSemantics;
  readonly rows: readonly DomscanAdaptedRow[];
}

/** Revalidate an application-local DomScan adaptation before downstream analysis. */
export function validateDomscanWindow(input: DomscanAdaptationResult): ValidatedDomscanWindow {
  if (input === null
      || typeof input !== 'object'
      || input.providerId !== DOMSCAN_PROVIDER_ID
      || !Array.isArray(input.rows)
      || !Array.isArray(input.batches)
      || input.batches.length !== 1) {
    fail('invalid_output', 'DomScan adapted window has invalid bounded metadata.');
  }
  let batch: CollectionBatch;
  try {
    batch = parseCollectionBatch(input.batches[0]!);
  } catch {
    fail('invalid_output', 'DomScan adapted batch is not valid canonical evidence.');
  }
  if (batch.collection.id !== input.collectionId || batch.idempotencyKey !== input.idempotencyKey) {
    fail('invalid_output', 'DomScan adapted batch disagrees with window identity.');
  }
  return {
    collection: structuredClone(batch.collection),
    semantics: structuredClone(input.semantics),
    rows: structuredClone(input.rows),
  };
}

/** Fail closed when two DomScan collections cannot be compared longitudinally. */
export function assertDomscanCollectionsComparable(
  left: Contract<'collection'>,
  right: Contract<'collection'>,
): void {
  if (left.providerId !== DOMSCAN_PROVIDER_ID || right.providerId !== DOMSCAN_PROVIDER_ID) {
    fail('incompatible_collections', 'Only DomScan collections may be checked for DomScan comparability.');
  }
  if (canonicalJson(left.method) !== canonicalJson(right.method)
      || left.providerConnectionId !== right.providerConnectionId
      || left.sourceSchema.id !== right.sourceSchema.id
      || left.sourceSchema.version !== right.sourceSchema.version
      || left.adapter.id !== right.adapter.id
      || left.adapter.version !== right.adapter.version) {
    fail('incompatible_collections', 'DomScan collections are not comparable across endpoints, methods, connections, or schema revisions.');
  }
}
