import { identifier } from '../contracts/primitives.js';

declare const tenantContextBrand: unique symbol;
export interface TenantContext { readonly [tenantContextBrand]: true }

const trustedContexts = new WeakMap<TenantContext, string>();

/** TEST ONLY: the caller is trusted test code, not an authenticated user. */
export function createTrustedTestTenantContext(tenantId: string): TenantContext {
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
