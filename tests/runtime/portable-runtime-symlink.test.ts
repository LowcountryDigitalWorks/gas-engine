import assert from 'node:assert/strict';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  createPortableRuntimeBundle,
  verifyPortableRuntimeBundle,
  type PortableRuntimeProfile,
} from '../../src/runtime/portable-runtime.js';
import { repository, temporaryDatabase } from '../persistence/helpers.js';

function profile(): PortableRuntimeProfile {
  return {
    version: '0.20.0',
    packageCompatibility: {
      name: '@lowcountrydigitalworks/gas-engine',
      version: '0.20.0',
    },
    database: {
      role: 'gas_sqlite',
      path: 'state/gas.sqlite',
      classification: 'private_runtime',
      retentionClass: 'state-protected',
    },
    generatedArtifactRoot: 'artifacts',
    allowedArtifactRoles: ['service_run'],
    allowedClassifications: ['ldw_internal'],
    retention: {
      id: 'release-020-retention',
      version: '1.0.0',
      classes: [
        { id: 'state-protected', classification: 'private_runtime', protected: true },
        { id: 'internal-90d', classification: 'ldw_internal', protected: false, maxAgeDays: 90 },
      ],
    },
    buildIdentity: 'release-020-synthetic-build',
  };
}

test('manifest-owned symlink fails closed in the isolated adversarial fixture', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  evidence.close();

  mkdirSync(resolve('local-artifacts'), { recursive: true });
  const parent = mkdtempSync(resolve('local-artifacts/release-020-symlink-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const root = join(parent, 'root');
  await createPortableRuntimeBundle({
    root,
    sourceDatabasePath: database.path,
    profile: profile(),
    artifacts: [],
  });

  const stateDirectory = join(root, 'state');
  const outside = join(parent, 'outside-state');
  mkdirSync(outside, { recursive: true });
  copyFileSync(join(stateDirectory, 'gas.sqlite'), join(outside, 'gas.sqlite'));
  rmSync(stateDirectory, { recursive: true, force: true });
  symlinkSync(outside, stateDirectory, process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal(lstatSync(stateDirectory).isSymbolicLink(), true);
  assert.throws(() => verifyPortableRuntimeBundle(root), /symlink/i);
});
