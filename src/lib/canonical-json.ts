import { createHash } from "node:crypto";
import { types } from "node:util";

/**
 * G.A.S. canonical JSON v1: recursively sort object keys by JavaScript UTF-16
 * code-unit order, preserve array order, and use JSON.stringify only for scalar
 * strings/numbers. Hash the resulting UTF-8 bytes with SHA-256. There is no
 * Unicode normalization, generated metadata, or claim of full RFC 8785/JCS
 * compatibility. Numbers use JavaScript's finite binary64 representation;
 * negative zero is rejected instead of silently collapsing into positive zero.
 *
 * Inputs must be plain data: ordinary arrays and objects with Object.prototype
 * or null prototypes, containing only enumerable own string-keyed data
 * properties. Accessors, symbols, holes, hidden/extraneous properties, proxies,
 * custom classes, cycles, and ill-formed UTF-16 strings are rejected. Repeated
 * references without a cycle are allowed and serialized at each occurrence.
 * These helpers do not parse arbitrary provider payloads, provide authorization,
 * or establish cryptographic authenticity. Never collect/hash secrets as an
 * alternative to excluding them from evidence.
 */
export const CANONICAL_JSON_LIMITS = Object.freeze({
  maximumDepth: 32, // Root is depth 0; each property/array element adds one.
  maximumValues: 10_000, // Includes root and repeated-reference occurrences.
  maximumContainerEntries: 1_000,
  maximumStringCodeUnits: 16_384, // Applies to property names as well as values.
  maximumBytes: 65_536, // Entire canonical UTF-8 output, including punctuation.
});

export const MAX_HASH_INPUT_BYTES = 1_048_576;

// Read actual typed-array state without invoking shadowing instance accessors.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)!.get!;

/** SHA-256 of exactly the bytes in this Uint8Array/Buffer view, at most 1 MiB. */
export function sha256Bytes(bytes: Uint8Array): string {
  if (!types.isUint8Array(bytes) || types.isProxy(bytes)) {
    throw new TypeError("Hash input must be a Uint8Array or Buffer");
  }
  const byteLength = Reflect.apply(byteLengthGetter, bytes, []) as number;
  const buffer = Reflect.apply(bufferGetter, bytes, []) as ArrayBufferLike;
  if (types.isSharedArrayBuffer(buffer)) {
    throw new TypeError("Shared-memory hash input is not supported");
  }
  // Constructing even an empty view rejects a detached underlying ArrayBuffer.
  new Uint8Array(buffer, 0, 0);
  if (byteLength > MAX_HASH_INPUT_BYTES) {
    throw new RangeError("Hash input exceeds the byte limit");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

/** Return bounded, deterministic JSON; unsupported input fails closed. */
export function canonicalJson(value: unknown): string {
  const activeAncestors = new WeakSet<object>();
  const chunks: string[] = [];
  let byteCount = 0;
  let valueCount = 0;

  function append(chunk: string): void {
    byteCount += Buffer.byteLength(chunk, "utf8");
    if (byteCount > CANONICAL_JSON_LIMITS.maximumBytes) {
      throw new RangeError("Canonical JSON exceeds the byte limit");
    }
    chunks.push(chunk);
  }

  function quoted(text: string): string {
    if (text.length > CANONICAL_JSON_LIMITS.maximumStringCodeUnits) {
      throw new RangeError("Canonical JSON string exceeds the length limit");
    }
    if (!text.isWellFormed()) {
      throw new TypeError("Canonical JSON strings must contain well-formed UTF-16");
    }
    return JSON.stringify(text);
  }

  function dataProperty(container: object, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError("Canonical JSON requires enumerable own data properties");
    }
    return descriptor.value as unknown;
  }

  function write(current: unknown, depth: number): void {
    valueCount += 1;
    if (depth > CANONICAL_JSON_LIMITS.maximumDepth) {
      throw new RangeError("Canonical JSON exceeds the depth limit");
    }
    if (valueCount > CANONICAL_JSON_LIMITS.maximumValues) {
      throw new RangeError("Canonical JSON exceeds the value-count limit");
    }
    if (current === null) {
      append("null");
      return;
    }
    switch (typeof current) {
      case "string":
        append(quoted(current));
        return;
      case "boolean":
        append(current ? "true" : "false");
        return;
      case "number":
        if (!Number.isFinite(current) || Object.is(current, -0)) {
          throw new TypeError("Canonical JSON numbers must be finite and not negative zero");
        }
        append(JSON.stringify(current));
        return;
      case "object":
        break;
      default:
        throw new TypeError("Unsupported canonical JSON value");
    }
    if (types.isProxy(current)) {
      throw new TypeError("Canonical JSON does not support proxies");
    }
    const array = Array.isArray(current);
    const prototype: unknown = Object.getPrototypeOf(current);
    if (
      (array && prototype !== Array.prototype) ||
      (!array && prototype !== Object.prototype && prototype !== null)
    ) {
      throw new TypeError("Canonical JSON requires plain objects and ordinary arrays");
    }
    if (activeAncestors.has(current)) {
      throw new TypeError("Canonical JSON does not support cycles");
    }
    const keys = Reflect.ownKeys(current);
    if (keys.some((key) => typeof key === "symbol")) {
      throw new TypeError("Canonical JSON does not support symbol properties");
    }
    activeAncestors.add(current);
    try {
      if (array) {
        if (current.length > CANONICAL_JSON_LIMITS.maximumContainerEntries) {
          throw new RangeError("Canonical JSON array exceeds the entry limit");
        }
        if (keys.length !== current.length + 1) {
          throw new TypeError("Canonical JSON arrays cannot have holes or extra properties");
        }
        append("[");
        for (let index = 0; index < current.length; index += 1) {
          if (index > 0) append(",");
          write(dataProperty(current, String(index)), depth + 1);
        }
        append("]");
      } else {
        if (keys.length > CANONICAL_JSON_LIMITS.maximumContainerEntries) {
          throw new RangeError("Canonical JSON object exceeds the entry limit");
        }
        append("{");
        const sortedKeys = (keys as string[]).sort();
        sortedKeys.forEach((key, index) => {
          if (index > 0) append(",");
          append(quoted(key));
          append(":");
          write(dataProperty(current, key), depth + 1);
        });
        append("}");
      }
    } finally {
      activeAncestors.delete(current);
    }
  }

  write(value, 0);
  return chunks.join("");
}

/** Lowercase SHA-256 hex of canonicalJson(value), encoded as UTF-8. */
export function hashCanonicalJson(value: unknown): string {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}
