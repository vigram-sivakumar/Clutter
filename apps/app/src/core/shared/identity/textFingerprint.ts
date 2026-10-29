/**
 * A 106-bit equality fingerprint of a string (two independent cyrb53 hashes), as a fixed-width hex string.
 *
 * It answers one question: "is the note on disk the same text this recovery record was started from?". It is not a
 * security hash and nothing is trusted because of it: a (vanishingly unlikely) collision could at worst make a
 * conflicting vault copy look unchanged, and restoring still only ever enters the editor as an unsaved edit the user
 * sees. It is synchronous so a snapshot can be built without awaiting WebCrypto, which jsdom does not provide.
 */
export function fingerprint(text: string): string {
  return `f1-${cyrb53(text, 0x9e3779b9)}${cyrb53(text, 0x85ebca6b)}`;
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);

  return value.toString(16).padStart(14, '0');
}

/**
 * The identity of a file's text as Sync and the Gate use it to recognise "the version I started from" (ADR-063): the
 * 106-bit fingerprint plus the text's length in UTF-16 units and in UTF-8 bytes. Still not a security hash (nothing
 * defends against someone crafting a collision), but an accidental match now needs the same two independent 53-bit
 * hashes and both lengths, and it is never the only protection: the replacement itself is conditional on the exact
 * bytes read (`replaceIf`).
 */
export function contentIdentity(text: string): string {
  return `${fingerprint(text)}:${text.length}:${new TextEncoder().encode(text).length}`;
}
