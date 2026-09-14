// The production storage surface exposes only the opaque authority type and its
// validation boundary. The issuer stays in src/internal/tenant-authority.ts so no
// ordinary production consumer can import a helper that mints tenant authority.
export { requireTenantContext, type TenantContext } from '../internal/tenant-authority.js';
