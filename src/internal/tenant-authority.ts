import { identifier } from '../contracts/primitives.js';

declare const tenantContextBrand: unique symbol;
export interface TenantContext { readonly [tenantContextBrand]: true }

const trustedContexts = new WeakMap<TenantContext, string>();

// Package-internal authority seam. Nothing on the production persistence surface
// may import or re-export this issuer: storage trusts a context, it cannot mint one.
// A later authenticated boundary owns the only production caller; TEST setup uses
// tests/support/tenant-authority.ts. This is not authentication.
export function issueTenantContext(tenantId: string): TenantContext {
  const id = identifier.parse(tenantId);
  const context = Object.freeze({}) as TenantContext;
  trustedContexts.set(context, id);
  return context;
}

/** Record fields, object clones, casts and proxies cannot mint authority. */
export function requireTenantContext(context: TenantContext): string {
  const tenantId = trustedContexts.get(context);
  if (!tenantId) throw new Error('A trusted TenantContext is required');
  return tenantId;
}
