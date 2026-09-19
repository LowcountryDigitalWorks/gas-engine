import { issueAuthenticatedPrincipal, authenticatedAuthority } from '../authentication/principal.js';
import { assembleOperatorCaseView } from '../operator/case-view.js';
import { buildOperatorCasePresentation, renderOperatorCaseHtml } from '../operator/html.js';
import { createD1OperatorReadRepositories, type GateD1Database } from './d1-read.js';

export interface GateAccessIdentity {
  readonly email?: string;
}

export interface GateAccessContext {
  readonly access?: {
    readonly aud?: string;
    getIdentity(): Promise<GateAccessIdentity>;
  };
}

export interface CloudflareGateEnv {
  readonly DB: GateD1Database;
  readonly GATE_OPERATOR_EMAIL: string;
  readonly GATE_TENANT_ID: string;
  readonly GATE_SITE_ID: string;
  readonly GATE_SCOPE_REVISION_ID: string;
  readonly GATE_PROVIDER_ID: string;
  readonly GATE_PROVIDER_CONNECTION_ID: string;
  readonly GATE_BASELINE_COLLECTION_ID: string;
  readonly GATE_CURRENT_COLLECTION_ID: string;
  readonly GATE_RECOMMENDATION_ID: string;
}

const securityHeaders = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
});

function response(body: string, status: number, contentType = 'text/plain; charset=utf-8', extra: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      ...securityHeaders,
      'Content-Type': contentType,
      ...extra,
    },
  });
}

function trustedConfig(env: CloudflareGateEnv): void {
  for (const [key, value] of Object.entries({
    GATE_OPERATOR_EMAIL: env.GATE_OPERATOR_EMAIL,
    GATE_TENANT_ID: env.GATE_TENANT_ID,
    GATE_SITE_ID: env.GATE_SITE_ID,
    GATE_SCOPE_REVISION_ID: env.GATE_SCOPE_REVISION_ID,
    GATE_PROVIDER_ID: env.GATE_PROVIDER_ID,
    GATE_PROVIDER_CONNECTION_ID: env.GATE_PROVIDER_CONNECTION_ID,
    GATE_BASELINE_COLLECTION_ID: env.GATE_BASELINE_COLLECTION_ID,
    GATE_CURRENT_COLLECTION_ID: env.GATE_CURRENT_COLLECTION_ID,
    GATE_RECOMMENDATION_ID: env.GATE_RECOMMENDATION_ID,
  })) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing trusted gate configuration: ${key}`);
  }
}

async function trustedAuthority(env: CloudflareGateEnv, context: GateAccessContext) {
  trustedConfig(env);
  if (context.access === undefined) return { status: 401 as const, authority: null };
  let identity: GateAccessIdentity;
  try {
    identity = await context.access.getIdentity();
  } catch {
    return { status: 401 as const, authority: null };
  }
  if (identity.email !== env.GATE_OPERATOR_EMAIL) return { status: 403 as const, authority: null };

  const principal = issueAuthenticatedPrincipal({
    principalId: 'synthetic-cloudflare-gate-operator',
    tenantId: env.GATE_TENANT_ID,
    grants: [{
      scope: {
        tenantId: env.GATE_TENANT_ID,
        siteId: env.GATE_SITE_ID,
        siteScopeRevisionId: env.GATE_SCOPE_REVISION_ID,
      },
      providerId: env.GATE_PROVIDER_ID,
      providerConnectionId: env.GATE_PROVIDER_CONNECTION_ID,
    }],
  });
  const authority = authenticatedAuthority(principal);
  if (authority === null) throw new Error('Trusted gate principal did not resolve authority');
  return { status: 200 as const, authority };
}

async function handle(request: Request, env: CloudflareGateEnv, context: GateAccessContext): Promise<Response> {
  const auth = await trustedAuthority(env, context);
  if (auth.authority === null) return response('Unauthorized', auth.status);

  const url = new URL(request.url);
  if (url.search !== '') return response('Unsupported selector', 400);

  if (url.pathname === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response('Method not allowed', 405, 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
    }
    return response(request.method === 'HEAD' ? '' : 'ok', 200);
  }

  if (url.pathname !== '/operator-case') return response('Not found', 404);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response('Method not allowed', 405, 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
  }

  const started = performance.now();
  const repositories = createD1OperatorReadRepositories(env.DB);
  try {
    const view = await assembleOperatorCaseView(
      repositories.evidence,
      repositories.review,
      auth.authority.context,
      {
        scope: {
          tenantId: env.GATE_TENANT_ID,
          siteId: env.GATE_SITE_ID,
          siteScopeRevisionId: env.GATE_SCOPE_REVISION_ID,
        },
        baselineCollectionId: env.GATE_BASELINE_COLLECTION_ID,
        currentCollectionId: env.GATE_CURRENT_COLLECTION_ID,
        selectedRecommendationId: env.GATE_RECOMMENDATION_ID,
      },
    );
    const html = renderOperatorCaseHtml(buildOperatorCasePresentation(view));
    const metrics = repositories.metrics.snapshot();
    const elapsedMs = performance.now() - started;
    const renderedBytes = new TextEncoder().encode(html).byteLength;
    return response(request.method === 'HEAD' ? '' : html, 200, 'text/html; charset=utf-8', {
      'X-GAS-Gate-D1-Queries': String(metrics.queryCount),
      'X-GAS-Gate-D1-Rows-Read': String(metrics.rowsRead),
      'X-GAS-Gate-D1-Rows-Written': String(metrics.rowsWritten),
      'X-GAS-Gate-D1-Size-After': String(metrics.sizeAfterBytes),
      'X-GAS-Gate-D1-Duration-Ms': metrics.databaseDurationMs.toFixed(3),
      'X-GAS-Gate-Local-Elapsed-Ms': elapsedMs.toFixed(3),
      'X-GAS-Gate-Rendered-Bytes': String(renderedBytes),
    });
  } catch {
    return response('Operator case unavailable', 500);
  }
}

export default { fetch: handle };
