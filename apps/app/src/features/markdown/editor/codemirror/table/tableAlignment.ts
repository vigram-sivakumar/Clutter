/**
 * `@lezer/markdown`'s `Table` extension does not parse the alignment row
 * (`| :--- | ---: |`) into per-column nodes — confirmed empirically
 * against the installed `@lezer/markdown@1.7.2`: it's a single opaque
 * `TableDelimiter` spanning the entire line (see
 * `markdownLanguage.regression.test.ts`'s "alignment row parses as a
 * single opaque TableDelimiter" test). Recovering per-column alignment
 * therefore means re-scanning that one node's own raw text — the same
 * "re-run a pure scanner over the node's own text" pattern already used
 * for WikiLink/Tag/Date (`scanWikiLink`/`scanTag`/`scanDate`), not a
 * parallel reimplementation of anything the grammar already does.
 *
 * Only ever called with text already validated by `@lezer/markdown`'s own
 * `delimiterLine` regex (a table wouldn't have parsed as a `Table` node at
 * all otherwise), so this doesn't need to re-validate shape — just
 * classify each already-known-valid cell segment.
 */
export type TableColumnAlignment = 'left' | 'center' | 'right' | null;

export function parseTableAlignment(delimiterRowText: string): TableColumnAlignment[] {
  const trimmed = delimiterRowText.trim().replace(/^\|/, '').replace(/\|$/, '');

  return trimmed.split('|').map((segment) => {
    const cell = segment.trim();
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) {
      return 'center';
    }
    if (right) {
      return 'right';
    }
    if (left) {
      return 'left';
    }
    return null;
  });
}
