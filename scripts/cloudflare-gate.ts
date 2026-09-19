import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const artifactRoot = resolve('local-artifacts', 'cloudflare-gate');
const persistRoot = resolve(artifactRoot, 'wrangler-state');
const schemaPath = resolve(artifactRoot, 'schema.sql');
const seedPath = resolve(artifactRoot, 'seed.sql');
const manifestPath = resolve(artifactRoot, 'manifest.json');
const reportPath = resolve(artifactRoot, 'gate-report.json');
const baseConfigPath = resolve('wrangler.gate.jsonc');
const wrangler = resolve('node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');

type JsonObject = Record<string, unknown>;
type D1CommandResult = { results?: JsonObject[]; success?: boolean; meta?: Record<string, unknown>; error?: string };

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  synthetic: true;
  schemaVersion: number;
  migrationHistory: { version: number; checksum: string }[];
  selectors: Record<string, string>;
  tableRows: Record<string, number>;
  seedRowsWritten: number;
  administrativeRefreshRowsWritten: number;
};

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runWrangler(args: string[], expectSuccess = true): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(wrangler, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      NO_COLOR: '1',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  const status = result.status ?? 1;
  if (expectSuccess && status !== 0) {
    throw new Error(`Wrangler command failed: ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  }
  if (!expectSuccess && status === 0) {
    throw new Error(`Wrangler command unexpectedly succeeded: ${args.join(' ')}`);
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status };
}

function parseD1Json(stdout: string): D1CommandResult[] {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  invariant(start >= 0 && end >= start, 'Wrangler D1 JSON output was not an array');
  const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  invariant(Array.isArray(value), 'Wrangler D1 JSON output was not an array');
  return value as D1CommandResult[];
}

function d1Args(extra: string[], configPath = baseConfigPath): string[] {
  return [
    'd1', 'execute', 'DB',
    '--local',
    '--persist-to', persistRoot,
    '--config', configPath,
    '--experimental-provision=false',
    '--experimental-auto-create=false',
    '--yes',
    '--json',
    ...extra,
  ];
}

function d1Command(sql: string, expectSuccess = true): D1CommandResult[] {
  const result = runWrangler(d1Args(['--command', sql]), expectSuccess);
  return expectSuccess ? parseD1Json(result.stdout) : [];
}

function d1File(path: string): D1CommandResult[] {
  return parseD1Json(runWrangler(d1Args(['--file', path])).stdout);
}

function rows(results: D1CommandResult[]): JsonObject[] {
  return results.flatMap((result) => result.results ?? []);
}

function sumMeta(results: D1CommandResult[], key: string): number {
  return results.reduce((sum, result) => {
    const value = result.meta?.[key];
    return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);
}

function lastMeta(results: D1CommandResult[], key: string): number {
  let found = 0;
  for (const result of results) {
    const value = result.meta?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) found = value;
  }
  return found;
}

function writeConfig(name: string, identity: string | null): string {
  const config = JSON.parse(readFileSync(baseConfigPath, 'utf8')) as JsonObject;
  delete config['$schema'];
  config['main'] = resolve('dist', 'src', 'cloudflare', 'worker.js');
  if (identity === null) {
    delete config['access'];
  } else {
    config['access'] = {
      dev: {
        aud: 'synthetic-gas-gate',
        identity: { email: identity },
      },
    };
  }
  const path = resolve(artifactRoot, `wrangler-${name}.json`);
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return path;
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error('Wrangler dev server did not become ready', { cause: lastError });
}

async function withDevServer<T>(
  configPath: string,
  port: number,
  work: () => Promise<T>,
): Promise<T> {
  const child = spawn(wrangler, [
    'dev',
    '--config', configPath,
    '--port', String(port),
    '--persist-to', persistRoot,
    '--log-level', 'error',
    '--show-interactive-dev-session=false',
    '--experimental-provision=false',
    '--experimental-auto-create=false',
  ], {
    env: {
      ...process.env,
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      NO_COLOR: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
  try {
    await waitForServer(port);
    return await work();
  } catch (error) {
    throw new Error(`Wrangler dev proof failed. ${stderr.slice(-4000)}`, { cause: error });
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolvePromise) => {
      if (child.exitCode !== null) return resolvePromise();
      child.once('exit', () => resolvePromise());
      setTimeout(() => { child.kill('SIGKILL'); resolvePromise(); }, 2_000).unref();
    });
  }
}

async function request(port: number, path: string, init?: RequestInit): Promise<{
  status: number;
  body: string;
  headers: Headers;
  elapsedMs: number;
}> {
  const started = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.text();
  return { status: response.status, body, headers: response.headers, elapsedMs: performance.now() - started };
}

function headerNumber(headers: Headers, name: string): number {
  const raw = headers.get(name);
  invariant(raw !== null, `Missing gate metric header: ${name}`);
  const value = Number(raw);
  invariant(Number.isFinite(value) && value >= 0, `Invalid gate metric header: ${name}`);
  return value;
}

async function expectOperatorFailure(port: number, label: string): Promise<void> {
  const result = await request(port, '/operator-case');
  invariant(result.status === 500, `${label}: expected generic operator failure`);
  invariant(result.body === 'Operator case unavailable', `${label}: failure leaked internal detail`);
}

function sourceBoundaryChecks(): void {
  const worker = readFileSync('src/cloudflare/worker.ts', 'utf8');
  const d1 = readFileSync('src/cloudflare/d1-read.ts', 'utf8');
  invariant(!/\bglobalThis\.fetch\s*\(|\bfetch\s*\([^)]*https?:/i.test(worker), 'Worker contains outbound fetch');
  invariant(!/WebSocket|XMLHttpRequest|node:https|node:http|undici|axios|activepieces/i.test(worker + d1),
    'Cloud gate runtime contains forbidden network/provider capability');
  invariant(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(d1),
    'D1 runtime adapter contains SQL write/DDL capability');
  invariant(!/persist(?:Collection|Measurement|Outcome)|createRecommendation|appendRecommendationRevision/i.test(d1),
    'D1 runtime adapter contains repository write capability');
  invariant(!/OpenAI|Anthropic|BYOK|Workers AI/i.test(worker + d1), 'Cloud gate runtime contains AI capability');
}

async function main(): Promise<void> {
  rmSync(persistRoot, { recursive: true, force: true });
  mkdirSync(persistRoot, { recursive: true });
  sourceBoundaryChecks();

  const schemaResults = d1File(schemaPath);
  const seedResults = d1File(seedPath);
  const seedRowsWrittenObserved = sumMeta(seedResults, 'rows_written');

  const expectedTables = [
    'schema_migrations', 'tenants', 'sites', 'site_scopes', 'provider_connections',
    'collections', 'collection_parts', 'source_records', 'observations',
    'recommendation_revisions', 'measurements', 'outcomes',
  ];
  const tableList = rows(d1Command('PRAGMA table_list;'))
    .filter((row) => row['schema'] === 'main' && expectedTables.includes(String(row['name'])));
  invariant(tableList.length === expectedTables.length, 'D1 schema is missing accepted tables');
  invariant(tableList.every((row) => Number(row['strict']) === 1), 'Accepted D1 tables must remain STRICT');

  const jsonProbe = rows(d1Command(`SELECT json_valid('{"gate":1}') AS valid, json_extract('{"gate":1}', '$.gate') AS extracted;`))[0]!;
  invariant(Number(jsonProbe['valid']) === 1 && Number(jsonProbe['extracted']) === 1, 'D1 JSON functions are incompatible');

  d1Command(`UPDATE outcomes SET payload = '{'
    WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-outcome';`, false);

  const oversizedProbe = rows(d1Command(`SELECT length(CAST(
    json_set(payload, '$.gateOversize', hex(zeroblob(32768))) AS BLOB
  )) AS bytes FROM outcomes
  WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-outcome';`))[0]!;
  invariant(Number(oversizedProbe['bytes']) > 65_536, 'Oversized payload probe did not exceed accepted byte limit');
  d1Command(`UPDATE outcomes
    SET payload = json_set(payload, '$.gateOversize', hex(zeroblob(32768)))
    WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-outcome';`, false);

  invariant(rows(d1Command('PRAGMA foreign_key_check;')).length === 0, 'Seeded D1 has broken foreign-key references');

  const indexRows = rows(d1Command(`SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name;`));
  const indexNames = new Set(indexRows.map((row) => String(row['name'])));
  for (const expected of [
    'observations_by_collection', 'observations_by_site', 'observations_by_provider',
    'recommendation_current_lookup', 'recommendation_by_lifecycle',
    'measurements_by_scope', 'measurements_by_recommendation',
    'outcomes_by_scope', 'outcomes_by_recommendation',
  ]) invariant(indexNames.has(expected), `D1 missing accepted index: ${expected}`);

  const history = rows(d1Command('SELECT version, checksum FROM schema_migrations ORDER BY version;'));
  invariant(JSON.stringify(history) === JSON.stringify(manifest.migrationHistory), 'D1 migration identity/checksums differ');

  for (const [table, expected] of Object.entries(manifest.tableRows)) {
    const row = rows(d1Command(`SELECT COUNT(*) AS count FROM ${table};`))[0]!;
    invariant(Number(row['count']) === expected, `D1 seed count mismatch for ${table}`);
  }

  d1Command(`INSERT INTO recommendation_revisions
    (tenant_id,id,revision,site_id,scope_revision_id,lifecycle,created_at,updated_at,contract_version,payload,payload_hash)
    SELECT tenant_id,'synthetic-invalid-check',0,site_id,scope_revision_id,lifecycle,created_at,updated_at,
      contract_version,json_set(payload,'$.id','synthetic-invalid-check','$.revision',0),payload_hash
    FROM recommendation_revisions WHERE tenant_id='tenant-alpha' LIMIT 1;`, false);

  d1Command(`INSERT INTO site_scopes (tenant_id,site_id,scope_revision_id)
    VALUES ('tenant-alpha','site-beta','synthetic-invalid-cross-owner');`, false);

  const noAccessConfig = writeConfig('no-access', null);
  const wrongAccessConfig = writeConfig('wrong-access', 'wrong-operator@example.test');
  const allowedConfig = writeConfig('allowed-access', 'operator@example.test');

  await withDevServer(noAccessConfig, 8791, async () => {
    const noAccess = await request(8791, '/operator-case');
    invariant(noAccess.status === 401, 'Missing Access context must fail 401');
    const forged = await request(8791, '/operator-case', {
      headers: {
        'Cf-Access-Authenticated-User-Email': 'operator@example.test',
        'Cf-Access-Jwt-Assertion': 'synthetic-forged-header',
      },
    });
    invariant(forged.status === 401, 'Forged Access headers must not replace ctx.access');
  });

  await withDevServer(wrongAccessConfig, 8792, async () => {
    const wrong = await request(8792, '/operator-case');
    invariant(wrong.status === 403, 'Wrong Access identity must fail 403');
  });

  let caseMetrics: {
    queryCount: number;
    rowsRead: number;
    rowsWritten: number;
    databaseSizeBytes: number;
    databaseDurationMs: number;
    localWorkerElapsedMs: number;
    clientElapsedMs: number;
    renderedHtmlBytes: number;
  } | undefined;

  await withDevServer(allowedConfig, 8793, async () => {
    const health = await request(8793, '/health');
    invariant(health.status === 200 && health.body === 'ok', 'Allowed identity health check failed');

    const normal = await request(8793, '/operator-case');
    invariant(normal.status === 200, 'Allowed identity operator case failed');
    invariant(normal.body.includes('HUMAN-AUTHORED')
      && normal.body.includes('HUMAN-DECLARED OUTCOME')
      && normal.body.includes('coverage_unknown')
      && normal.body.includes('synthetic-gate-selected'),
    'Rendered operator HTML lost accepted Release 0.9 semantics');
    invariant(!normal.body.includes('Synthetic Beta recommendation intentionally reuses the Alpha selector ID.'),
      'Alpha Worker render crossed into Beta data');

    for (const selector of [
      '?tenantId=tenant-beta',
      '?siteId=site-beta',
      '?baselineCollectionId=synthetic-collection-gate-current',
      '?selectedRecommendationId=synthetic-gate-rejected',
    ]) {
      invariant((await request(8793, `/operator-case${selector}`)).status === 400,
        `Request selector substitution did not fail closed: ${selector}`);
    }
    invariant((await request(8793, '/operator-case/tenant-beta')).status === 404, 'Path selector substitution did not fail closed');
    invariant((await request(8793, '/operator-case', { method: 'POST' })).status === 405, 'POST must fail closed');
    invariant((await request(8793, '/operator-case', { method: 'PUT' })).status === 405, 'PUT must fail closed');
    invariant((await request(8793, '/write')).status === 404, 'No write route may exist');

    caseMetrics = {
      queryCount: headerNumber(normal.headers, 'X-GAS-Gate-D1-Queries'),
      rowsRead: headerNumber(normal.headers, 'X-GAS-Gate-D1-Rows-Read'),
      rowsWritten: headerNumber(normal.headers, 'X-GAS-Gate-D1-Rows-Written'),
      databaseSizeBytes: headerNumber(normal.headers, 'X-GAS-Gate-D1-Size-After'),
      databaseDurationMs: headerNumber(normal.headers, 'X-GAS-Gate-D1-Duration-Ms'),
      localWorkerElapsedMs: headerNumber(normal.headers, 'X-GAS-Gate-Local-Elapsed-Ms'),
      clientElapsedMs: normal.elapsedMs,
      renderedHtmlBytes: headerNumber(normal.headers, 'X-GAS-Gate-Rendered-Bytes'),
    };
    invariant(caseMetrics.queryCount <= 50, 'Operator case exceeds Workers Free D1-query invocation bound');
    invariant(caseMetrics.rowsWritten === 0, 'Read-only Worker performed D1 writes');

    const hashRow = rows(d1Command(`SELECT payload_hash FROM recommendation_revisions
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-selected' ORDER BY revision DESC LIMIT 1;`))[0]!;
    const originalHash = String(hashRow['payload_hash']);
    d1Command(`UPDATE recommendation_revisions SET payload_hash='${'0'.repeat(64)}'
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-selected' AND revision=3;`);
    await expectOperatorFailure(8793, 'canonical hash corruption');
    d1Command(`UPDATE recommendation_revisions SET payload_hash='${originalHash}'
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-selected' AND revision=3;`);

    d1Command(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<98)
      INSERT INTO recommendation_revisions
      (tenant_id,id,revision,site_id,scope_revision_id,lifecycle,created_at,updated_at,contract_version,payload,payload_hash)
      SELECT tenant_id,printf('synthetic-gate-rec-overflow-%03d',n),1,site_id,scope_revision_id,'proposed',
        created_at,updated_at,contract_version,
        json_set(payload,'$.id',printf('synthetic-gate-rec-overflow-%03d',n),'$.revision',1,'$.lifecycle','proposed'),
        lower(hex(zeroblob(32)))
      FROM recommendation_revisions CROSS JOIN seq
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-selected' AND revision=1;`);
    await expectOperatorFailure(8793, 'recommendation list overflow');
    d1Command(`DELETE FROM recommendation_revisions WHERE tenant_id='tenant-alpha' AND id LIKE 'synthetic-gate-rec-overflow-%';`);

    d1Command(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<98)
      INSERT INTO measurements
      (tenant_id,id,site_id,scope_revision_id,recommendation_id,relationship_role,baseline_measurement_id,
       created_at,contract_version,payload,payload_hash)
      SELECT tenant_id,printf('synthetic-gate-measurement-overflow-%03d',n),site_id,scope_revision_id,
        recommendation_id,'baseline',NULL,created_at,contract_version,
        json_set(payload,'$.id',printf('synthetic-gate-measurement-overflow-%03d',n),'$.relationship',json('{"role":"baseline"}')),
        lower(hex(zeroblob(32)))
      FROM measurements CROSS JOIN seq
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-measurement-baseline';`);
    await expectOperatorFailure(8793, 'measurement list overflow');
    d1Command(`DELETE FROM measurements WHERE tenant_id='tenant-alpha' AND id LIKE 'synthetic-gate-measurement-overflow-%';`);

    d1Command(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<99)
      INSERT INTO outcomes
      (tenant_id,id,site_id,scope_revision_id,recommendation_id,created_at,contract_version,payload,payload_hash)
      SELECT tenant_id,printf('synthetic-gate-outcome-overflow-%03d',n),site_id,scope_revision_id,
        recommendation_id,created_at,contract_version,
        json_set(payload,'$.id',printf('synthetic-gate-outcome-overflow-%03d',n)),
        lower(hex(zeroblob(32)))
      FROM outcomes CROSS JOIN seq
      WHERE tenant_id='tenant-alpha' AND id='synthetic-gate-outcome';`);
    await expectOperatorFailure(8793, 'outcome list overflow');
    d1Command(`DELETE FROM outcomes WHERE tenant_id='tenant-alpha' AND id LIKE 'synthetic-gate-outcome-overflow-%';`);

    d1Command(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<2047)
      INSERT INTO observations
      (tenant_id,id,source_id,collection_id,site_id,scope_revision_id,connection_id,provider_id,
       contract_version,payload,payload_hash)
      SELECT tenant_id,printf('synthetic-gate-observation-overflow-%04d',n),source_id,collection_id,
        site_id,scope_revision_id,connection_id,provider_id,contract_version,
        json_set(payload,'$.id',printf('synthetic-gate-observation-overflow-%04d',n)),
        lower(hex(zeroblob(32)))
      FROM observations CROSS JOIN seq
      WHERE tenant_id='tenant-alpha' AND collection_id='synthetic-collection-gate-current' LIMIT 2048;`);
    await expectOperatorFailure(8793, '2,048 observation snapshot overflow');
    d1Command(`DELETE FROM observations WHERE tenant_id='tenant-alpha' AND id LIKE 'synthetic-gate-observation-overflow-%';`);

    const restored = await request(8793, '/operator-case');
    invariant(restored.status === 200, 'Gate database did not restore after adversarial local proofs');
  });

  invariant(caseMetrics !== undefined, 'No operator-case metrics were captured');
  const metrics = caseMetrics;
  const viewsPerDay = 25;
  const adminRefreshesPerDay = 2;
  const daysPerProjectionMonth = 30;
  const projection = {
    workload: {
      operatorCaseViewsPerDay: viewsPerDay,
      operatorCaseViewsPer30Days: viewsPerDay * daysPerProjectionMonth,
      administrativeSeedRefreshesPerDay: adminRefreshesPerDay,
      administrativeSeedRefreshesPer30Days: adminRefreshesPerDay * daysPerProjectionMonth,
    },
    workers: {
      freeRequestsPerDay: 100_000,
      projectedRequestsPerDay: viewsPerDay,
      projectedRequestsPer30Days: viewsPerDay * daysPerProjectionMonth,
      dailyUtilizationPercent: viewsPerDay / 100_000 * 100,
    },
    d1: {
      freeRowsReadPerDay: 5_000_000,
      freeRowsWrittenPerDay: 100_000,
      freeQueriesPerInvocation: 50,
      freeDatabaseBytes: 500_000_000,
      projectedRuntimeRowsReadPerDay: metrics.rowsRead * viewsPerDay,
      projectedRuntimeRowsReadPer30Days: metrics.rowsRead * viewsPerDay * daysPerProjectionMonth,
      projectedRuntimeRowsWrittenPerDay: 0,
      projectedAdministrativeRowsWrittenPerDay: manifest.administrativeRefreshRowsWritten * adminRefreshesPerDay,
      projectedAdministrativeRowsWrittenPer30Days:
        manifest.administrativeRefreshRowsWritten * adminRefreshesPerDay * daysPerProjectionMonth,
      dailyRowsReadUtilizationPercent: metrics.rowsRead * viewsPerDay / 5_000_000 * 100,
      dailyAdministrativeRowsWrittenUtilizationPercent:
        manifest.administrativeRefreshRowsWritten * adminRefreshesPerDay / 100_000 * 100,
      queriesPerInvocationUtilizationPercent: metrics.queryCount / 50 * 100,
      databaseStorageUtilizationPercent: metrics.databaseSizeBytes / 500_000_000 * 100,
    },
  };

  const report = {
    synthetic: true,
    gate: 'release-1.0-local-cloud-readiness',
    remoteDeploymentAuthorized: false,
    remoteResourcesCreated: [],
    packageVersionRemains: '0.9.0',
    staticAssets: { count: 0, bytes: 0, rationale: 'No separate asset surface is needed for the one-document operator proof.' },
    schemaCompatibility: {
      strictTables: 'PASS',
      jsonFunctions: 'PASS',
      jsonPayloadConstraint: 'PASS',
      payloadByteLimit65536: 'PASS',
      foreignKeys: 'PASS',
      checkConstraints: 'PASS',
      compositeOwnershipForeignKey: 'PASS',
      requiredIndexes: 'PASS',
      migrationHistoryAndChecksums: 'PASS',
      acceptedSeedImport: 'PASS',
      canonicalPayloadAndHashFailClosed: 'PASS',
      recommendationList100Bound: 'PASS',
      measurementList100Bound: 'PASS',
      outcomeList100Bound: 'PASS',
      observationSnapshot2048Bound: 'PASS',
    },
    accessAndWorkerBoundary: {
      missingAccessContext: 'PASS',
      forgedAccessHeaders: 'PASS',
      wrongIdentity: 'PASS',
      exactAllowedIdentity: 'PASS',
      requestSelectorSubstitution: 'PASS',
      unsupportedMethodsAndWriteRoute: 'PASS',
      betaIsolationWithOverlappingIds: 'PASS',
      release09HtmlSemantics: 'PASS',
      outboundNetworkCapability: 'ABSENT',
      runtimeWriteCapability: 'ABSENT',
    },
    operatorCase: {
      workerRequests: 1,
      d1Queries: metrics.queryCount,
      d1RowsRead: metrics.rowsRead,
      d1RowsWritten: metrics.rowsWritten,
      seededDatabaseBytes: metrics.databaseSizeBytes,
      renderedHtmlBytes: metrics.renderedHtmlBytes,
      localD1DurationMs: metrics.databaseDurationMs,
      localWorkerElapsedMs: metrics.localWorkerElapsedMs,
      localClientRoundTripMs: metrics.clientElapsedMs,
      localTimingCaveat: 'Local Wrangler/Miniflare timing is compatibility evidence only and is not production Workers CPU accounting.',
    },
    administrativeSetup: {
      seedDataRowsWritten: manifest.seedRowsWritten,
      schemaHistoryRowsWritten: manifest.migrationHistory.length,
      conservativeRowsWrittenPerRefresh: manifest.administrativeRefreshRowsWritten,
      schemaCommandRowsWrittenObserved: sumMeta(schemaResults, 'rows_written'),
      seedCommandRowsWrittenObserved: seedRowsWrittenObserved,
      seedCommandRowsWrittenMeasurementNote:
        'Wrangler local multi-statement --file metadata may not expose per-row rows_written; deterministic table-count verification supplies the administrative write count.',
      databaseSizeAfterSeedBytes: Math.max(lastMeta(schemaResults, 'size_after'), lastMeta(seedResults, 'size_after')),
    },
    freeTierProjection: projection,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('CLOUDFLARE_GATE_REPORT ' + JSON.stringify(report));
}

await main();
