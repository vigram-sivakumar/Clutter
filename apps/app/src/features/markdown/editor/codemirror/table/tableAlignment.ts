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

/**
 * Every column's own raw, trimmed cell text from *any* pipe-delimited
 * table row's raw line text (`"---"`/`":--"`/`"--:"`/`":-:"` for a
 * delimiter row; `"Name"`/`"Age"` for a header row) — plain string-
 * splitting ("strip optional leading/trailing pipe, then split on the
 * rest"), not tree-based, so it works identically whether or not Lezer
 * has classified the surrounding lines as a `Table` yet at all. Shared by
 * `parseTableAlignment` (classify each delimiter cell), by
 * `tableActivationNormalization.ts` (rebuild a delimiter row's own
 * canonical text, preserving each cell's content verbatim), and — its
 * only header-row consumer — `tableActivationNormalization.ts`'s own
 * pre-tree-recognition detection path, which has no `TableHeader` node to
 * read `rowCells` from yet (the very transition it exists to detect).
 * Where a real tree *does* already exist, `rowCells` (tableWidgetField.ts)
 * is the tree-based equivalent for the header/data rows specifically
 * (which have real `TableDelimiter` children between cells, unlike the
 * alignment row's own single opaque `TableDelimiter` leaf — see this
 * module's own header comment) and remains the correct choice there.
 */
export function splitPipeRowCells(rowText: string): string[] {
  const trimmed = rowText.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((segment) => segment.trim());
}

export function parseTableAlignment(delimiterRowText: string): TableColumnAlignment[] {
  return splitPipeRowCells(delimiterRowText).map((cell) => {
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
