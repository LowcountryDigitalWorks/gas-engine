import { readFileSync } from 'node:fs';
import type { TestContext } from 'node:test';
import { issueAuthenticatedPrincipal, type AuthenticatedPrincipal, type IngestionAuthenticator } from '../../src/authentication/principal.js';
import { createIngestionService } from '../../src/ingestion/service.js';
import { createIngestionHandler } from '../../src/ingestion/http.js';
import type { CollectionBatch, EvidenceRepository } from '../../src/persistence/repository.js';
import { batch, repository, sourceContext, type TemporaryDatabase } from '../persistence/helpers.js';

export const synthetic = JSON.parse(readFileSync('tests/fixtures/synthetic-auth.json', 'utf8')) as {
  synthetic: true; alphaCredential: string; betaCredential: string; unknownCredential: string; opaqueCredential: string; inertEvidence: string;
};
export function principal(tenant: 'alpha' | 'beta'): AuthenticatedPrincipal {
  return issueAuthenticatedPrincipal({ principalId: `synthetic-principal-${tenant}`, tenantId: `tenant-${tenant}`, grants: [sourceContext(batch(tenant))] });
}
export function syntheticAuthenticator(): IngestionAuthenticator {
  const identities = new Map([[synthetic.alphaCredential, principal('alpha')], [synthetic.betaCredential, principal('beta')]]);
  return { async authenticate(credential) { return identities.get(credential) ?? null; } };
}
export function content(value: CollectionBatch = batch()): Omit<CollectionBatch, 'idempotencyKey'> {
  const { idempotencyKey: ignored, ...body } = value;
  void ignored;
  return body;
}
export function request(value: CollectionBatch = batch(), credential = synthetic.alphaCredential, headers: Record<string, string> = {}): Request {
  return new Request('https://synthetic.invalid/v1/evidence/collections', {
    method: 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', 'Idempotency-Key': value.idempotencyKey, ...headers },
    body: JSON.stringify(content(value)),
  });
}
export async function setup(t: TestContext, database?: TemporaryDatabase) {
  const repo = await repository(t, database);
  const service = createIngestionService(repo);
  const auth = syntheticAuthenticator();
  return { repo, service, auth, handler: createIngestionHandler(auth, service) };
}
export function failureRepository(repo: EvidenceRepository, error: Error): EvidenceRepository {
  return new Proxy(repo, { get(target, key) {
    if (key === 'persistCollection') return async () => { throw error; };
    const value = Reflect.get(target, key) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
