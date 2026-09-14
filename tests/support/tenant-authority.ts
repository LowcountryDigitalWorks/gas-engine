import { issueTenantContext } from '../../src/internal/tenant-authority.js';
import type { TenantContext } from '../../src/persistence/tenant-context.js';

/**
 * TEST ONLY. The caller is trusted local test setup, never an authenticated user
 * and never a request handler. This file is the single test-side authority path;
 * the production persistence surface exports no equivalent.
 */
export function createTestTenantContext(tenantId: string): TenantContext {
  return issueTenantContext(tenantId);
}
