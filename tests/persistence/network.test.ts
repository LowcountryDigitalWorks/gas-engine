import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:https';
import { connect } from 'node:net';
import { lookup } from 'node:dns';

test('the synthetic runner blocks fetch, socket, HTTP and DNS calls before any network access', () => {
  assert.throws(() => fetch('https://synthetic.invalid'), /Network disabled/);
  assert.throws(() => request('https://synthetic.invalid'), /Network disabled/);
  assert.throws(() => connect(9, '127.0.0.1'), /Network disabled/);
  assert.throws(() => lookup('synthetic.invalid', () => {}), /Network disabled/);
  assert.equal(process.permission.has('child'), false);
  assert.equal(process.permission.has('worker'), false);
  assert.equal(process.permission.has('fs.write', 'package.json'), false);
});
