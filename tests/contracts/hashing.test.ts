import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANONICAL_JSON_LIMITS,
  MAX_HASH_INPUT_BYTES,
  canonicalJson,
  hashCanonicalJson,
  sha256Bytes,
} from "../../src/lib/canonical-json.js";

test("exact-byte SHA-256 matches known vectors and honors the view boundaries", () => {
  const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(sha256Bytes(Buffer.from("abc")), abc);
  assert.equal(sha256Bytes(new Uint8Array([97, 98, 99])), abc);
  const surrounding = new Uint8Array([0, 97, 98, 99, 255]);
  assert.equal(sha256Bytes(surrounding.subarray(1, 4)), abc);
  assert.equal(
    sha256Bytes(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.notEqual(sha256Bytes(Buffer.from("abc\n")), abc);
});

test("logical object identity ignores insertion order at every depth", () => {
  const first = { z: [1, { beta: true, alpha: null }], a: { y: 2, x: "text" } };
  const second = { a: { x: "text", y: 2 }, z: [1, { alpha: null, beta: true }] };
  assert.equal(
    canonicalJson(first),
    '{"a":{"x":"text","y":2},"z":[1,{"alpha":null,"beta":true}]}',
  );
  assert.equal(hashCanonicalJson(first), hashCanonicalJson(second));
  assert.match(hashCanonicalJson(first), /^[0-9a-f]{64}$/);
  assert.equal(
    hashCanonicalJson(first),
    sha256Bytes(Buffer.from(canonicalJson(first), "utf8")),
  );
});

test("arrays retain order and changing supplied metadata changes identity", () => {
  assert.notEqual(hashCanonicalJson([1, 2]), hashCanonicalJson([2, 1]));
  const before = { record: "synthetic-record", receivedAt: "2026-01-01T00:00:00Z" };
  const after = { ...before, receivedAt: "2026-01-02T00:00:00Z" };
  assert.notEqual(hashCanonicalJson(before), hashCanonicalJson(after));
  assert.equal(canonicalJson({}), "{}");
  assert.deepEqual(Object.keys(before), ["record", "receivedAt"]);
});

test("key ordering is lexical UTF-16, with no Unicode normalization", () => {
  assert.equal(canonicalJson({ "2": 2, "10": 10, "1": 1 }), '{"1":1,"10":10,"2":2}');
  assert.equal(canonicalJson({ "\ue000": 2, "\ud83d\ude00": 1 }), '{"😀":1,"":2}');
  assert.notEqual(hashCanonicalJson("é"), hashCanonicalJson("e\u0301"));
  assert.equal(canonicalJson({ text: "line\n\t\"\\😀", zero: 0 }), '{"text":"line\\n\\t\\\"\\\\😀","zero":0}');
});

test("plain null-prototype dictionaries, frozen data, and repeated references are valid", () => {
  const dictionary: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  dictionary["__proto__"] = "ordinary own data";
  const shared = Object.freeze({ zero: 0 });
  assert.equal(canonicalJson(dictionary), '{"__proto__":"ordinary own data"}');
  assert.equal(canonicalJson([shared, shared]), '[{"zero":0},{"zero":0}]');
});

test("unsupported scalars fail instead of being coerced, omitted, or replaced", () => {
  for (const unsupported of [undefined, NaN, Infinity, -Infinity, -0, 1n, () => 1, Symbol("value")]) {
    assert.throws(() => canonicalJson(unsupported), TypeError);
    assert.throws(() => canonicalJson({ nested: unsupported }), TypeError);
    assert.throws(() => canonicalJson([unsupported]), TypeError);
  }
  assert.equal(canonicalJson(0), "0");
});

test("non-data objects and proxies fail without invoking custom behavior", () => {
  class CustomRecord { value = 1; }
  class CustomArray extends Array<unknown> {}
  for (const unsupported of [new Date("2026-01-01T00:00:00Z"), new CustomRecord(), new CustomArray(), new Map(), new Set(), /x/, new Number(1), new Uint8Array([1])]) {
    assert.throws(() => canonicalJson(unsupported), TypeError);
  }
  let invoked = false;
  const proxy = new Proxy({}, { ownKeys() { invoked = true; return []; } });
  assert.throws(() => canonicalJson(proxy), TypeError);
  assert.equal(invoked, false);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.throws(() => canonicalJson(revoked.proxy), TypeError);
  assert.throws(() => canonicalJson({ toJSON() { invoked = true; return {}; } }), TypeError);
  assert.equal(invoked, false);
});

test("symbols, accessors, and hidden values cannot disappear during canonicalization", () => {
  let invoked = false;
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get() { invoked = true; return 1; },
  });
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  const symbol = { [Symbol("hidden")]: 1 };
  for (const unsupported of [accessor, hidden, symbol]) {
    assert.throws(() => canonicalJson(unsupported), TypeError);
  }
  assert.equal(invoked, false);
});

test("arrays reject holes, extra properties, symbols, and accessor elements", () => {
  const extra = Object.assign([1], { extra: 2 });
  const holeWithExtra = Object.assign(new Array<unknown>(1), { extra: 2 });
  const hidden = Object.defineProperty([1], "hidden", { value: 2 });
  const symbol = Object.assign([1], { [Symbol("extra")]: 2 });
  const accessor = Object.defineProperty([1], "0", { get() { throw new Error("must not run"); } });
  for (const unsupported of [new Array<unknown>(1), extra, holeWithExtra, hidden, symbol, accessor]) {
    assert.throws(() => canonicalJson(unsupported), TypeError);
  }
});

test("cycles and lone UTF-16 surrogates fail, including malformed property names", () => {
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJson(cycle), TypeError);
  const arrayCycle: unknown[] = [];
  arrayCycle.push(arrayCycle);
  assert.throws(() => canonicalJson(arrayCycle), TypeError);
  for (const malformed of ["\ud800", "\udfff", "a\ud800b"]) {
    assert.throws(() => canonicalJson(malformed), TypeError);
    assert.throws(() => canonicalJson({ [malformed]: true }), TypeError);
  }
});

test("canonicalization enforces depth, entry, string, value-count, and UTF-8 byte bounds", () => {
  let nested: unknown = null;
  for (let depth = 0; depth < CANONICAL_JSON_LIMITS.maximumDepth; depth += 1) nested = [nested];
  assert.doesNotThrow(() => canonicalJson(nested));
  assert.throws(() => canonicalJson([nested]), RangeError);
  assert.doesNotThrow(() => canonicalJson(new Array(CANONICAL_JSON_LIMITS.maximumContainerEntries).fill(0)));
  assert.throws(() => canonicalJson(new Array(CANONICAL_JSON_LIMITS.maximumContainerEntries + 1).fill(0)), RangeError);
  assert.throws(() => canonicalJson(Object.fromEntries(Array.from({ length: CANONICAL_JSON_LIMITS.maximumContainerEntries + 1 }, (_, index) => [`key-${index}`, 0]))), RangeError);
  assert.throws(() => canonicalJson("a".repeat(CANONICAL_JSON_LIMITS.maximumStringCodeUnits + 1)), RangeError);
  assert.throws(() => canonicalJson({ ["a".repeat(CANONICAL_JSON_LIMITS.maximumStringCodeUnits + 1)]: 0 }), RangeError);
  // 10 arrays of 1,000 zeros fit the byte/entry/depth bounds, but not value count.
  assert.throws(() => canonicalJson(Array.from({ length: 10 }, () => new Array(1_000).fill(0))), /value-count limit/);
  // Four valid strings exceed 64 KiB only after encoding their multibyte content.
  assert.throws(() => canonicalJson(new Array(4).fill("é".repeat(10_000))), /byte limit/);
});

test("raw-byte hashing rejects wrong types, excessive bytes, shared memory, and detached buffers", () => {
  assert.throws(() => sha256Bytes("abc" as unknown as Uint8Array), TypeError);
  assert.throws(() => sha256Bytes(new Uint16Array([1]) as unknown as Uint8Array), TypeError);
  assert.doesNotThrow(() => sha256Bytes(new Uint8Array(MAX_HASH_INPUT_BYTES)));
  assert.throws(() => sha256Bytes(new Uint8Array(MAX_HASH_INPUT_BYTES + 1)), RangeError);
  assert.throws(() => sha256Bytes(new Uint8Array(new SharedArrayBuffer(1))), TypeError);
  const detached = new Uint8Array([1]);
  structuredClone(detached, { transfer: [detached.buffer] });
  assert.throws(() => sha256Bytes(detached), TypeError);
  const oversized = new Uint8Array(MAX_HASH_INPUT_BYTES + 1);
  Object.defineProperty(oversized, "byteLength", { get() { throw new Error("must not run"); } });
  assert.throws(() => sha256Bytes(oversized), RangeError);
});
