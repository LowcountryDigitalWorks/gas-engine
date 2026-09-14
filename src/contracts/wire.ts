import { z } from 'zod';
import {
  availability, completeness, dimensions, evidenceReferences, identifier, integrity,
  method, metric, observationValue, rationale, reason, revision, schemaVersion,
  scope, scopedReference, sourceIdentity, subject, timestamp, timeWindow,
  timeWindowRules, versionedReference,
} from './primitives.js';

export const sourceRecordSchema = z.strictObject({
  schemaVersion, kind: z.literal('source_record'), identity: sourceIdentity,
  integrity, availability,
});
export const provenanceSchema = z.strictObject({
  schemaVersion,
  source: sourceIdentity,
  adapter: versionedReference,
  sourceSchema: versionedReference,
  runId: identifier,
  sourceTime: timeWindow,
  collectedAt: timestamp,
  receivedAt: timestamp,
  sourceTimezone: z.string().min(1).max(128).regex(/\S/).optional(),
  completeness,
  integrity,
  normalization: versionedReference,
  availability,
});
export const collectionSchema = z.strictObject({
  schemaVersion, kind: z.literal('collection'), id: identifier, scope,
  providerId: identifier, providerConnectionId: identifier.optional(),
  adapter: versionedReference, sourceSchema: versionedReference, method,
  sourceTime: timeWindow, startedAt: timestamp, endedAt: timestamp,
  collectedAt: timestamp, receivedAt: timestamp, completeness,
});
export const cohortSchema = z.strictObject({
  schemaVersion, kind: z.literal('cohort'), id: identifier, revision,
  context: z.strictObject({ scope, subject, metric, dimensions, method, timeWindowRules }),
});
export const observationSchema = z.strictObject({
  schemaVersion, kind: z.literal('observation'), id: identifier,
  cohort: cohortSchema,
  value: observationValue,
  provenance: provenanceSchema,
});
export const inferenceSchema = z.strictObject({
  schemaVersion, kind: z.literal('inference'), id: identifier, scope,
  supportingObservations: z.array(scopedReference).min(1).max(32),
  contradictingObservations: z.array(scopedReference).max(32),
  method: versionedReference,
  rationale,
  uncertainty: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('qualitative'), level: z.enum(['low', 'medium', 'high']), basis: rationale }),
    z.strictObject({ state: z.literal('unknown'), reason }),
  ]),
  createdAt: timestamp,
});
export const recommendationSchema = z.strictObject({
  schemaVersion, kind: z.literal('recommendation'), id: identifier, scope,
  evidence: evidenceReferences,
  rationale,
  priority: z.strictObject({ level: z.enum(['low', 'medium', 'high', 'unassessed']), basis: rationale }),
  authorityClass: z.enum(['internal_review', 'separately_authorized_external_action']),
  lifecycle: z.enum(['proposed', 'in_review', 'accepted', 'rejected', 'superseded']),
  revision, createdAt: timestamp, updatedAt: timestamp,
});

const authorityReference = z.strictObject({ reference: identifier, revision });
const terminalExecution = {
  requestedAt: timestamp, executedAt: timestamp,
  authority: authorityReference,
  externalReceipt: identifier.optional(),
};
export const actionSchema = z.strictObject({
  schemaVersion, kind: z.literal('action'), id: identifier, scope,
  recommendation: z.strictObject({ id: identifier, revision }),
  plan: z.strictObject({ id: identifier, revision }),
  execution: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('planned') }),
    z.strictObject({ state: z.literal('requested'), requestedAt: timestamp, authority: authorityReference }),
    z.strictObject({ state: z.literal('succeeded'), ...terminalExecution }),
    z.strictObject({ state: z.literal('failed'), ...terminalExecution, reason }),
    z.strictObject({ state: z.literal('cancelled'), cancelledAt: timestamp, reason }),
  ]),
  verification: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('not_verified') }),
    z.strictObject({ state: z.literal('verified'), verifiedAt: timestamp, method: versionedReference, evidence: evidenceReferences }),
    z.strictObject({ state: z.literal('failed'), checkedAt: timestamp, reason }),
  ]),
});

export const comparability = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('comparable') }),
  z.strictObject({ state: z.literal('discontinuous'), reason }),
  z.strictObject({ state: z.literal('unknown'), reason }),
]);
export const measurementSchema = z.strictObject({
  schemaVersion, kind: z.literal('measurement'), id: identifier,
  cohort: cohortSchema,
  relationship: z.discriminatedUnion('role', [
    z.strictObject({ role: z.literal('baseline') }),
    z.strictObject({ role: z.literal('follow_up'), baselineMeasurementId: identifier }),
  ]),
  dueWindow: timeWindow,
  result: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('not_due'), reason }),
    z.strictObject({ state: z.literal('not_measured'), reason }),
    z.strictObject({
      state: z.literal('measured'), observedWindow: timeWindow,
      observations: z.array(z.strictObject({ reference: scopedReference, value: observationValue })).min(1).max(32),
    }),
  ]),
  comparability,
  methodology: versionedReference,
  createdAt: timestamp,
});

const measurements = z.array(scopedReference).min(2).max(32);
export const outcomeSchema = z.strictObject({
  schemaVersion, kind: z.literal('outcome'), id: identifier, scope,
  recommendationId: identifier.optional(),
  assessment: z.discriminatedUnion('direction', [
    z.strictObject({ direction: z.literal('improved'), measurements, comparability: z.literal('comparable'), rationale }),
    z.strictObject({ direction: z.literal('regressed'), measurements, comparability: z.literal('comparable'), rationale }),
    z.strictObject({ direction: z.literal('unchanged'), measurements, comparability: z.literal('comparable'), rationale }),
    z.strictObject({ direction: z.literal('inconclusive'), measurements: z.array(scopedReference).max(32), reason }),
    z.strictObject({ direction: z.literal('not_due'), reason }),
    z.strictObject({ direction: z.literal('not_measured'), reason }),
  ]),
  attribution: z.discriminatedUnion('strength', [
    z.strictObject({ strength: z.literal('none'), reason }),
    z.strictObject({ strength: z.literal('technical_verification'), basis: rationale }),
    z.strictObject({ strength: z.literal('association'), basis: rationale }),
    z.strictObject({ strength: z.literal('controlled_evidence'), basis: rationale, method: versionedReference }),
  ]),
  createdAt: timestamp,
});

// The single registry drives JSON Schema exports and typed application parsing.
export const wireSchemas = {
  sourceRecord: sourceRecordSchema,
  provenance: provenanceSchema,
  observationValue,
  collection: collectionSchema,
  cohort: cohortSchema,
  observation: observationSchema,
  inference: inferenceSchema,
  recommendation: recommendationSchema,
  action: actionSchema,
  measurement: measurementSchema,
  outcome: outcomeSchema,
} as const;
export type ContractName = keyof typeof wireSchemas;
export type Contract<N extends ContractName> = z.infer<(typeof wireSchemas)[N]>;
