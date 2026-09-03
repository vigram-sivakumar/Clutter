/**
 * Insertion-time-only writer for `![[path]]` — the Embed counterpart to
 * wikilink/wikiLinkSerialize.ts's `serializeWikiLink`. Escaping/normalize
 * rules are identical (this milestone reuses the same `[[path]]` grammar
 * wholesale, per embedScanner.ts delegating to scanWikiLink) but kept as
 * their own small, self-contained functions here rather than importing
 * wikiLinkSerialize.ts's private helpers, so this file has no dependency on
 * WikiLink internals beyond the shared scanner it already reuses.
 *
 * No alias parameter: this milestone has no Embed alias-editing affordance
 * (no `|`-key keymap command, mirroring wikiLinkAutocomplete.ts's
 * `acceptReferenceForDisplayName`) — only the reference/path itself is ever
 * inserted by autocomplete acceptance.
 */

const ASCII_ESCAPE_CANDIDATES = new Set(['\\', '|', ']']);

function escapeSegment(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ASCII_ESCAPE_CANDIDATES.has(ch)) {
      out += '\\';
    }
    out += ch;
  }
  return out;
}

function normalize(value: string): string {
  return value.trim();
}

/**
 * Serializes a resource path into canonical Embed Markdown. Pure function
 * of the decoded value alone, mirroring `serializeWikiLink`'s own
 * stability guarantee.
 */
export function serializeEmbed(path: string): string {
  return `![[${escapeSegment(normalize(path))}]]`;
}
