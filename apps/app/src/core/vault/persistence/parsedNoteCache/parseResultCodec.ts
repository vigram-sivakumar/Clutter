/**
 * JSON codec for parse results that preserves what plain JSON loses: own keys
 * whose value is `undefined` (an optional property present-with-undefined is
 * observable to downstream code, so the cached path must reproduce it exactly
 * rather than weaken the comparison — ADR-053).
 *
 * `undefined` is written as the marker object `{"$undef":true}` and restored
 * as an own property set to `undefined`. Anything that does not survive the
 * round trip exactly — a marker collision, NaN, -0, a Date/Map/Set, a sparse
 * array, a non-plain prototype — is refused by `encodeParts`, so the entry is
 * simply not cached and parsing proceeds normally.
 */
const MARKER_KEY = '$undef';

function isMarker(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === MARKER_KEY &&
    (value as Record<string, unknown>)[MARKER_KEY] === true
  );
}

/** Restores `undefined` markers, always building new objects (never sharing). */
export function restoreUndefined(node: unknown): unknown {
  if (isMarker(node)) return undefined;
  if (Array.isArray(node)) return node.map(restoreUndefined);
  if (typeof node === 'object' && node !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      // defineProperty so a key named "__proto__" stays an own key.
      Object.defineProperty(out, key, {
        value: restoreUndefined((node as Record<string, unknown>)[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return node;
}

function isPlainContainer(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null;
}

/**
 * Strict structural identity: same own-key sets (including keys whose value is
 * `undefined`), `Object.is` on primitives, same array lengths, plain
 * prototypes only. Deliberately stricter than `toEqual`.
 */
export function structurallyIdentical(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  )
    return false;
  if (!isPlainContainer(a) || !isPlainContainer(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const descriptorA = Object.getOwnPropertyDescriptor(a, key);
    const descriptorB = Object.getOwnPropertyDescriptor(b, key);
    if (!descriptorA || !descriptorB) return false;
    if (!('value' in descriptorA) || !('value' in descriptorB)) return false;
    if (descriptorA.enumerable !== descriptorB.enumerable) return false;
    if (!structurallyIdentical(descriptorA.value, descriptorB.value))
      return false;
  }
  return true;
}

/**
 * Encodes `value` to JSON text, or returns null if it cannot be reproduced
 * exactly (verified by decoding and comparing — the guarantee does not rest on
 * assumptions about the shape of parse results).
 */
export function encodeParts(
  value: unknown
): { text: string; raw: unknown } | null {
  let text: string;
  try {
    text = JSON.stringify(value, (_key, entry) =>
      entry === undefined ? { [MARKER_KEY]: true } : entry
    );
  } catch {
    return null; // cycles, BigInt, …
  }
  if (typeof text !== 'string') return null;
  const raw = JSON.parse(text);
  return structurallyIdentical(value, restoreUndefined(raw))
    ? { text, raw }
    : null;
}
