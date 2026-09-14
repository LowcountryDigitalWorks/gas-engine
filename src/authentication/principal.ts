import { z } from 'zod';
import { identifier, scope } from '../contracts/primitives.js';
import { canonicalJson } from '../lib/canonical-json.js';
import { issueTenantContext, type TenantContext } from '../internal/tenant-authority.js';

const grantSchema = z.strictObject({ scope, providerId: identifier, providerConnectionId: identifier });
const principalSchema = z.strictObject({ principalId: identifier, tenantId: identifier, grants: z.array(grantSchema).max(16) });
export type IngestionGrant = Readonly<{
  scope: Readonly<z.infer<typeof scope>>;
  providerId: string;
  providerConnectionId: string;
}>;
declare const principalBrand: unique symbol;
export interface AuthenticatedPrincipal {
  readonly [principalBrand]: true;
  readonly principalId: string;
  readonly tenantId: string;
  readonly grants: readonly IngestionGrant[];
}
export interface IngestionAuthenticator {
  authenticate(credential: string): Promise<AuthenticatedPrincipal | null>;
}
interface PrincipalAuthority { readonly principal: AuthenticatedPrincipal; readonly context: TenantContext }
const authenticated = new WeakMap<AuthenticatedPrincipal, PrincipalAuthority>();

/** TRUSTED ADAPTER ONLY: call after verifying credentials, never with request claims.
 * This package-internal trust boundary is not an identity provider or a sandbox.
 */
export function issueAuthenticatedPrincipal(input: {
  principalId: string; tenantId: string; grants: readonly IngestionGrant[];
}): AuthenticatedPrincipal {
  canonicalJson(input);
  const data = principalSchema.parse(input);
  if (data.grants.some((grant) => grant.scope.tenantId !== data.tenantId)) throw new Error('Trusted principal configuration has inconsistent grants');
  const grants = Object.freeze(data.grants.map((grant) => Object.freeze({ ...grant, scope: Object.freeze(grant.scope) })));
  const principal = Object.freeze({ principalId: data.principalId, tenantId: data.tenantId, grants }) as AuthenticatedPrincipal;
  authenticated.set(principal, Object.freeze({ principal, context: issueTenantContext(data.tenantId) }));
  return principal;
}

/** Identity lookup precedes all property reads; cloned/cast/proxied data has no authority. */
export function authenticatedAuthority(principal: AuthenticatedPrincipal): PrincipalAuthority | null {
  return authenticated.get(principal) ?? null;
}
