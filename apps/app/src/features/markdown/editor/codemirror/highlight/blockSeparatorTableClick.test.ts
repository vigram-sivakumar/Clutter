// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from '../table/tableGeometry';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';

/**
 * Table-specific click-to-insert-a-line-above affordance on the existing
 * `.cm-block-separator` widget — verifies the small addition to
 * `blockSeparatorDecoration.ts` (only a table's own *leading* separator —
 * the synthetic one rendered when the table has no real content above it
 * at all — gets a `tableFrom` tag and a `mousedown` listener; every other
 * separator, table-adjacent or not, is untouched) without re-testing the
 * generic spacing system itself, already covered by
 * `blockSeparatorDecoration.test.ts`.
 *
 * Product requirement (corrected mid-implementation): the separator above
 * a table always renders, unchanged, whether or not the table has content
 * above it — but clicking only ever inserts a line when there is
 * currently *nothing* above the table. A table that already has content
 * above it renders an ordinary, non-interactive separator; clicking it is
 * a true no-op (no insert, no second line, no cursor move).
 */

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), blockSeparatorDecoration()],
  });
  return new EditorView({ state, parent });
}

function separators(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-block-separator'));
}

function tableSeparator(view: EditorView): HTMLElement | undefined {
  return separators(view).find((el) => el.dataset.tableFrom !== undefined);
}

/**
 * The (untagged, non-interactive) separator that sits immediately above
 * `table`'s own first line in the rendered DOM — located by DOM
 * adjacency to that line's own text (this minimal harness mounts no
 * `tableWidgetDecoration()`, so a table's first line still renders as an
 * ordinary `.cm-line`), not by document-order index arithmetic, so it
 * stays correct regardless of how many separators precede it.
 */
function separatorAboveTableFirstLine(view: EditorView, table: { from: number }): HTMLElement | undefined {
  const firstLineText = view.state.sliceDoc(table.from, view.state.doc.lineAt(table.from).to);
  return separators(view).find((sep) => sep.nextElementSibling?.textContent === firstLineText);
}

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('block separator — table as the first document content (clickable)', () => {
  it('gets a leading separator (12px, tagged for that table) even though no line precedes it', () => {
    const view = mountView(`${BASIC_TABLE}\n\nBelow.`);

    const tableFrom = findAllTables(view.state)[0]!.from;
    const sep = tableSeparator(view);

    expect(sep).toBeDefined();
    expect(parseInt(sep!.style.height, 10)).toBe(12);
    expect(sep!.dataset.tableFrom).toBe(String(tableFrom));
  });

  it('clicking it inserts exactly one line above the table and places the cursor there', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    click(tableSeparator(view)!);

    expect(view.state.doc.toString()).toBe(`\n${doc}`);
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);
  });

  it('the table itself and the trailing line below it are unchanged by the click', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    click(tableSeparator(view)!);

    const table = findAllTables(view.state)[0]!;
    expect(view.state.sliceDoc(table.from, table.to)).toBe(BASIC_TABLE);
    expect(view.state.doc.toString().endsWith('Below.')).toBe(true);
  });

  it('a single click never creates more than one new blank line', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    click(tableSeparator(view)!);

    expect(view.state.doc.toString()).toBe(`\n${doc}`);
    expect(view.state.doc.lines).toBe(EditorState.create({ doc }).doc.lines + 1);
  });

  it('table-only document (nothing below either): clicking still inserts exactly one line above, table unchanged', () => {
    const view = mountView(BASIC_TABLE);

    click(tableSeparator(view)!);

    expect(view.state.doc.toString()).toBe(`\n${BASIC_TABLE}`);
    const table = findAllTables(view.state)[0]!;
    expect(view.state.sliceDoc(table.from, table.to)).toBe(BASIC_TABLE);
    expect(view.state.selection.main.anchor).toBe(0);
  });

  it('after the click, the separator above the (no longer leading) table behaves like the "content above" case — a further click is a no-op', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    click(tableSeparator(view)!);
    const afterFirstClick = view.state.doc.toString();
    expect(afterFirstClick).toBe(`\n${doc}`);

    // The table now has a real (blank) line above it — the separator
    // above it is no longer the synthetic leading one and must no longer
    // be tagged/clickable at all.
    expect(tableSeparator(view)).toBeUndefined();
  });
});

describe('block separator — table with existing content above (unchanged, click is a no-op)', () => {
  it('renders a normal 12px separator above the table, not tagged for click', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    expect(tableSeparator(view)).toBeUndefined();
    const heights = separators(view).map((el) => parseInt(el.style.height, 10));
    expect(heights).toContain(12);
  });

  it('clicking the separator immediately above the table does nothing: no insert, no cursor move, document unchanged', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);
    const originalSelection = view.state.selection.main;
    const table = findAllTables(view.state)[0]!;

    click(separatorAboveTableFirstLine(view, table)!);

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.anchor).toBe(originalSelection.anchor);
    expect(view.state.selection.main.head).toBe(originalSelection.head);
  });

  it('"Above." and the trailing line remain byte-for-byte unchanged after a click attempt', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);
    const table = findAllTables(view.state)[0]!;

    click(separatorAboveTableFirstLine(view, table)!);

    const text = view.state.doc.toString();
    expect(text).toBe(doc);
    expect(text.startsWith('Above.\n')).toBe(true);
    expect(text.endsWith('\nBelow.')).toBe(true);
  });
});

describe('block separator — non-table separators stay inert (regression)', () => {
  it('a separator between two ordinary paragraphs has no tableFrom tag and clicking it does nothing', () => {
    const doc = 'Paragraph A\n\nParagraph B';
    const view = mountView(doc);

    const sep = separators(view)[0]!;
    expect(sep.dataset.tableFrom).toBeUndefined();

    click(sep);

    expect(view.state.doc.toString()).toBe(doc);
  });

  it('no separator anywhere carries a tableFrom tag unless the table is the very first document content', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = mountView(doc);

    const tagged = separators(view).filter((el) => el.dataset.tableFrom !== undefined);
    expect(tagged).toHaveLength(0);
  });
});
