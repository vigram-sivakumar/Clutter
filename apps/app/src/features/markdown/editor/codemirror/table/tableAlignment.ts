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
/**
 * Splits on `|` only when it isn't escaped (`\|`, GFM's own literal-pipe
 * escape) — required for the header-row consumer specifically (this
 * module's own top doc comment): a delimiter/alignment cell can only ever
 * contain `-`/`:`, never a literal pipe to escape, but a real header cell
 * legitimately can (`Milestone 6`'s own table-creation path generates
 * exactly this). A naive `split('|')` would misread `\|` as a column
 * boundary, corrupting the column count for any such header — this was
 * confirmed as a real, reproducible bug via that path's own tests before
 * this fix, not a theoretical concern.
 */
const UNESCAPED_PIPE = /(?<!\\)\|/;

export function splitPipeRowCells(rowText: string): string[] {
  const trimmed = rowText.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(UNESCAPED_PIPE).map((segment) => segment.trim());
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

/**
 * A cell's own target **total gap width** — padding included, the unit
 * `padCellContent`/`buildWidthMatchedRowText`/`buildDelimiterCellText`
 * (`tableGeometry.ts`, below) all work in: `" Name "` is 6
 * (`Math.max(1, "Name".length) + 2`). Shared by `tableActivationNormalization.ts`'s
 * own `computeColumnWidths` (header-only, at table-birth) and
 * `tableColumnNormalization.ts`'s own full-table width computation
 * (header *and* every body cell) — the same "what total gap width does
 * this one cell's content need" question, asked over a different set of
 * cells by each caller, not two different questions.
 */
export function cellGapWidth(content: string): number {
  return Math.max(1, content.length) + 2;
}

/**
 * `":---"` / `":---:"` / `"---:"` / `"---"`, sized to `width` (a total gap
 * width, `cellGapWidth`'s own unit) — the GFM delimiter cell for one
 * column, preserving whichever alignment colons apply. Extracted from
 * `tableActivationNormalization.ts`'s own `canonicalDelimiterRowText`
 * (its per-cell body, unchanged in behavior) so `tableColumnNormalization.ts`
 * can build the identical shape of delimiter cell for a full-table
 * normalization pass without re-deriving the same colon/dash-count rule a
 * second time. `width` is clamped up to whatever the colons actually
 * present require (`minimumDelimiterGapWidth`, below) — never rendered
 * narrower than a valid GFM delimiter cell.
 */
export function buildDelimiterCellText(alignment: TableColumnAlignment, width: number): string {
  const left = alignment === 'left' || alignment === 'center';
  const right = alignment === 'right' || alignment === 'center';
  const colonCount = (left ? 1 : 0) + (right ? 1 : 0);
  const dashCount = Math.max(1, width - 2 - colonCount);
  return (left ? ':' : '') + '-'.repeat(dashCount) + (right ? ':' : '');
}

/**
 * The minimum valid **total gap width** GFM permits for a delimiter cell
 * with `alignment` — at least one hyphen (GFM's own floor), plus one
 * character per alignment colon actually present, plus the mandatory
 * leading/trailing space `buildDelimiterCellText` always emits. `null`
 * (no alignment declared, plain `---`) needs only the single hyphen: `1 +
 * 0 + 2 = 3`. `'center'` (`:---:'`) needs both colons: `1 + 2 + 2 = 5`.
 * The floor a full-table normalization pass must never let a column's
 * computed width fall below, even for an all-empty column with a short
 * header — a real GFM requirement, not this codebase's own stylistic
 * choice.
 */
export function minimumDelimiterGapWidth(alignment: TableColumnAlignment): number {
  const colonCount = alignment === 'center' ? 2 : alignment ? 1 : 0;
  return 1 + colonCount + 2;
}
