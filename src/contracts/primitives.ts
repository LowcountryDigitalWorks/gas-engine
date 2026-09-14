import { z } from 'zod';

// Wire schemas use portable constraints only. Cross-field checks live in domain/validate.ts.
export const SCHEMA_VERSION = '1.0' as const;
export const schemaVersion = z.literal(SCHEMA_VERSION);
export const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const version = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/);
export const revision = z.number().int().min(1).max(1_000_000);
export const reason = z.string().min(1).max(512).regex(/\S/);
export const rationale = z.string().min(1).max(2048).regex(/\S/);
export const shortText = z.string().min(1).max(128).regex(/\S/);
export const timestamp = z.iso.datetime({ precision: 3 });
export const timeWindow = z.strictObject({ start: timestamp, end: timestamp });
export const versionedReference = z.strictObject({ id: identifier, version });
export const scope = z.strictObject({
  tenantId: identifier,
  siteId: identifier,
  siteScopeRevisionId: identifier,
});
export const subject = z.strictObject({
  kind: z.enum(['site', 'page', 'prompt', 'entity']),
  reference: identifier,
});
export const metric = z.strictObject({
  id: identifier,
  meaningVersion: version,
  valueType: z.enum(['number', 'text', 'boolean']),
  unit: shortText.optional(),
});

// A fixed vocabulary avoids unbounded metadata bags. Omission means unspecified,
// never wildcard equality; comparison uses the complete declared context.
export const dimensions = z.strictObject({
  promptCohort: z.strictObject({ id: identifier, revision }).optional(),
  providerId: identifier.optional(),
  surface: shortText.optional(),
  model: shortText.optional(),
  geography: shortText.optional(),
  language: shortText.optional(),
  device: shortText.optional(),
  configuration: versionedReference.optional(),
});
export const method = z.strictObject({
  id: identifier,
  version,
  configurationId: identifier,
  configurationRevision: revision,
});
export const timeWindowRules = z.strictObject({
  id: identifier,
  version,
  alignment: z.enum(['calendar', 'rolling', 'point']),
  durationSeconds: z.number().int().min(0).max(31_622_400),
  timezone: shortText,
});
export const scopedReference = z.strictObject({ scope, id: identifier });
export const evidenceReference = z.strictObject({
  scope,
  kind: z.enum(['observation', 'inference']),
  id: identifier,
});
export const evidenceReferences = z.array(evidenceReference).min(1).max(32);

export const observedValue = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('number'), value: z.number().min(-1e15).max(1e15) }),
  z.strictObject({ type: z.literal('text'), value: z.string().min(1).max(2048).regex(/\S/) }),
  z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
]);
export const observationValue = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('observed'), value: observedValue }),
  z.strictObject({ state: z.literal('unknown'), reason }),
  z.strictObject({ state: z.literal('unavailable'), reason }),
  z.strictObject({ state: z.literal('not_collected'), reason }),
  z.strictObject({ state: z.literal('not_applicable'), reason }),
]);

const count = z.number().int().min(0).max(1_000_000);
export const completeness = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('complete'), expectedCount: count, receivedCount: count }),
  z.strictObject({ state: z.literal('partial'), expectedCount: count.optional(), receivedCount: count, reason }),
  z.strictObject({ state: z.literal('unavailable'), receivedCount: z.literal(0), reason }),
  z.strictObject({ state: z.literal('failed'), receivedCount: count, reason }),
]);

// Provider references are opaque identifiers, not credential-bearing URLs or payloads.
export const sourceIdentity = z.strictObject({
  scope,
  providerId: identifier,
  providerConnectionId: identifier.optional(),
  sourceRecordId: identifier,
});
export const integrity = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('hashed'),
    algorithm: z.literal('sha256'),
    representation: z.enum(['exact_bytes', 'canonical_json_v1']),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ state: z.literal('unavailable'), reason }),
]);
export const availability = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('available'), reference: identifier, expiresAt: timestamp.optional() }),
  z.strictObject({ state: z.literal('unavailable'), reason }),
  z.strictObject({ state: z.literal('expired'), reason }),
  z.strictObject({ state: z.literal('deleted'), reason }),
]);

// These are names for validated opaque IDs, never capabilities or access grants.
export const identifierSchemas = {
  tenant: identifier, site: identifier, siteScopeRevision: identifier,
  provider: identifier, providerConnection: identifier, adapter: identifier,
  sourceSchema: identifier, run: identifier, sourceRecord: identifier,
  observation: identifier, inference: identifier, recommendation: identifier,
  action: identifier, measurement: identifier, outcome: identifier, cohort: identifier,
} as const;
