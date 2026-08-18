/**
 * Insertion-time-only writer. Isolated in this slice by design: called
 * from nowhere except its own test file. No autocomplete, no UI insertion
 * command, no other feature wires into it yet.
 */

/**
 * Escapes every literal `\`, `|`, and individual `]` character —
 * unconditionally, not only `]]`-forming pairs. A position-sensitive
 * "only escape what's strictly necessary" rule was considered and
 * rejected: a lone trailing `]` can silently combine with the closer
 * written immediately after it (`path = "A]"` serialized unescaped would
 * produce `[[A]]]`, which mis-parses), a boundary case invisible to a
 * scan of the data alone. Escaping every occurrence is both simpler
 * (context-free, per-character) and the only version that's actually
 * correct — see docs/editor-research/clutter-editor-wikilink-grammar-corrections.md.
 */
function escapeSegment(value: string): string {
  let out = '';
  for (const ch of value) {
    if (ch === '\\' || ch === '|' || ch === ']') {
      out += '\\';
    }
    out += ch;
  }
  return out;
}

/**
 * Normalizes a path/alias value for canonical serialization: trims
 * incidental leading/trailing whitespace. This is a writer-side rule only
 * — the parser never rewrites existing non-canonical text just because it
 * was read (docs/editor-architecture-decisions.md, "lenient reader,
 * strict writer").
 */
function normalize(value: string): string {
  return value.trim();
}

/**
 * Serializes a `(path, alias)` value into canonical WikiLink Markdown.
 * Pure function of the decoded value alone — never of any prior raw text
 * — which is what guarantees repeated serialization can't drift
 * (canonical-serialization stability).
 */
export function serializeWikiLink(path: string, alias: string | null): string {
  const normalizedPath = normalize(path);
  const escapedPath = escapeSegment(normalizedPath);

  if (alias === null) {
    return `[[${escapedPath}]]`;
  }

  const normalizedAlias = normalize(alias);
  const escapedAlias = escapeSegment(normalizedAlias);
  return `[[${escapedPath}|${escapedAlias}]]`;
}
