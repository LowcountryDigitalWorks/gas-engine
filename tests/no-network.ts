import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

// Loaded before tests. This is an accidental-network tripwire, not an OS sandbox.
function denied(): never { throw new Error('Network disabled for synthetic tests'); }
for (const [module, names] of [
  [http, ['get', 'request']], [https, ['get', 'request']],
  [net, ['connect', 'createConnection']], [net.Socket.prototype, ['connect']],
  [tls, ['connect']], [dgram, ['createSocket']],
  [dns, ['lookup', 'lookupService', ...Object.keys(dns).filter((key) => key.startsWith('resolve'))]],
  [dns.promises, ['lookup', 'lookupService', ...Object.keys(dns.promises).filter((key) => key.startsWith('resolve'))]],
] as const) {
  for (const name of names) Object.defineProperty(module, name, { value: denied });
}
for (const name of ['fetch', 'WebSocket']) Object.defineProperty(globalThis, name, { value: denied, writable: false, configurable: false });
syncBuiltinESMExports();
