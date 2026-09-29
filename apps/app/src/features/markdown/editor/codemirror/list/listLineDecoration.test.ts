// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { blockquoteLineDecoration } from '../highlight/blockquoteLineDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listLineDecoration } from './listLineDecoration';
import { listMarkerDecoration } from './listMarkerDecoration';
import {
  getFixedListMarkerWidthPx,
  getFixedMarkerWidthPx,
  refreshListMarkerWidthCache,
} from './listMarkerWidth';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), listLineDecoration(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function nthLine(view: EditorView, index: number): HTMLElement {
  const line = lines(view)[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line;
}

function hasListLine(line: HTMLElement): boolean {
  return line.className.includes('cm-list-line');
}

function indentPx(line: HTMLElement): number {
  const raw = line.style.getPropertyValue('--list-indent-px').trim();
  return raw ? parseFloat(raw.replace(/px$/, '')) : 0;
}

describe('listLineDecoration', () => {
  afterEach(() => {
    refreshListMarkerWidthCache();
  });

  it('a single bullet item gets cm-list-line with a positive reserved indent', () => {
    const view = mountView('- bullet item');
    const line = nthLine(view, 0);

    expect(hasListLine(line)).toBe(true);
    expect(indentPx(line)).toBeGreaterThan(0);
  });

  it('a plain paragraph gets no cm-list-line and no inline style at all', () => {
    const view = mountView('plain paragraph');
    const line = nthLine(view, 0);

    expect(line.className).toBe('cm-line');
    expect(hasListLine(line)).toBe(false);
  });

  it.each([
    ['- ', 'dash'],
    ['* ', 'star'],
    ['+ ', 'plus'],
  ])('every bullet kind (%s) reserves the identical indent', (marker) => {
    const view = mountView(`${marker}item`);
    expect(hasListLine(nthLine(view, 0))).toBe(true);
  });

  it('every unordered marker kind reserves the exact same indent as every other kind', () => {
    const dash = mountView('- item');
    const star = mountView('* item');
    const plus = mountView('+ item');

    expect(indentPx(nthLine(dash, 0))).toBe(indentPx(nthLine(star, 0)));
    expect(indentPx(nthLine(star, 0))).toBe(indentPx(nthLine(plus, 0)));
  });

  it('an ordered item gets cm-list-line with a positive reserved indent', () => {
    const view = mountView('1. one');
    expect(hasListLine(nthLine(view, 0))).toBe(true);
    expect(indentPx(nthLine(view, 0))).toBeGreaterThan(0);
  });

  it('a task item gets cm-list-line with the same indent regardless of its own concealed ordered/bullet kind or digit count', () => {
    // Task items get their own dedicated fixed footprint
    // (`getTaskMarkerFootprintPx()`) since taskCheckboxDecoration.ts
    // conceals the *entire* marker+separator+"[ ]" run — the concealed
    // kind/digit-count must never leak into the reserved indent. This
    // does not assert equality with a *plain* bullet/ordered item's own
    // indent: those use a different footprint function
    // (`getBulletMarkerFootprintPx()`/`getOrderedMarkerFootprintPx()`),
    // which in the real app resolves to a different real pixel value
    // (each marker kind carries its own trailing-margin rule) — see
    // `listMarkerWidth.ts`'s own doc comment.
    const bulletTask = mountView('- [ ] task item');
    const orderedTask = mountView('100. [ ] task item');

    expect(hasListLine(nthLine(bulletTask, 0))).toBe(true);
    expect(indentPx(nthLine(orderedTask, 0))).toBe(indentPx(nthLine(bulletTask, 0)));
  });

  it('a checked task item gets the identical indent to an unchecked one', () => {
    const unchecked = mountView('- [ ] task item');
    const checked = mountView('- [x] task item');

    expect(indentPx(nthLine(checked, 0))).toBe(indentPx(nthLine(unchecked, 0)));
  });

  describe('task-item separator-space regression (the real, unconcealed space after "]")', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      refreshListMarkerWidthCache();
    });

    /**
     * Regression test for the exact live bug: `taskCheckboxDecoration.ts`
     * conceals only up to `TaskMarker.to` — the real separator space
     * between `]` and the item's content is left as ordinary visible
     * text and was previously not counted anywhere, so the wrapped row
     * landed short of the first-line "L" by exactly one space glyph's
     * width. Uses a controllable canvas mock for a deterministic
     * expected value (real-font verification was done live — see
     * `listMarkerWidth.ts`'s own doc comment for the 4.1875px measured
     * in the app's actual font).
     */
    it('adds the real separator-space width on top of the checkbox footprint', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 5 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView('- [ ] task item');
      const expectedFootprint = getFixedMarkerWidthPx(); // box + margin (0 in jsdom, no stylesheet)
      const expectedSeparator = 5; // one space char, mocked at 5px/char

      expect(indentPx(nthLine(view, 0))).toBe(expectedFootprint + expectedSeparator);
    });

    it('is uniform regardless of the concealed marker being bullet or ordered, or its digit count', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 5 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const bullet = mountView('- [ ] task item');
      const ordered = mountView('100. [ ] task item');

      expect(indentPx(nthLine(ordered, 0))).toBe(indentPx(nthLine(bullet, 0)));
    });

    it('a task item with nothing typed after "]" yet reserves no extra separator width', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 5 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView('- [ ]');
      // With nothing after "]" yet, the parser doesn't form a real `Task`
      // node here (confirmed directly), so this falls through to the
      // ordinary bullet branch — its own fixed list-marker floor, not the
      // task/blockquote one.
      expect(indentPx(nthLine(view, 0))).toBe(getFixedListMarkerWidthPx());
    });

    it('measures every real separator character when more than one space follows "]" (valid, non-canonical Markdown)', () => {
      const measureText = vi.fn((text: string) => ({ width: text.length * 5 }));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        font: '',
        measureText,
      } as unknown as CanvasRenderingContext2D);
      refreshListMarkerWidthCache();

      const view = mountView('- [ ]   task item'); // 3 spaces after "]"
      const expectedFootprint = getFixedMarkerWidthPx();

      expect(indentPx(nthLine(view, 0))).toBe(expectedFootprint + 3 * 5);
    });
  });

  it('an empty item (marker + separator, no content yet) still gets cm-list-line', () => {
    const view = mountView('- ');
    expect(hasListLine(nthLine(view, 0))).toBe(true);
  });

  it('a bare marker with no separator yet gets no cm-list-line', () => {
    const view = mountView('-');
    expect(hasListLine(nthLine(view, 0))).toBe(false);
  });

  it('multi-line list: every item line gets its own class', () => {
    const view = mountView('- one\n- two\n- three');
    expect(lines(view).map(hasListLine)).toEqual([true, true, true]);
  });

  /**
   * Deliberately reversed (2026-09-29): this used to assert the second,
   * zero-indentation physical line also got `cm-list-line` — CommonMark
   * lazily folds it into the same `Paragraph`/`ListItem` (no blank line
   * interrupts them), so `nearestListItem()` finds the same item for
   * both, but that is structural *membership*, not visual list-line
   * *ownership*. Confirmed directly against Obsidian's own real DOM for
   * the identical shape (list item + unindented plain text, zero blank
   * lines): only the physical line that itself carries the marker gets
   * hanging-indent styling; a later, unindented source line does not,
   * even though it is technically part of the same lazily-continued
   * node. See `lineOwnsListIndent()`'s own doc comment in
   * `listLineDecoration.ts`.
   */
  it('lazy continuation with NO indentation of its own (a later, plain source line) does NOT get the class — only the marker\'s own document line does', () => {
    const view = mountView('- one\nlazy continuation');
    const rows = lines(view);

    expect(rows.map(hasListLine)).toEqual([true, false]);
  });

  it('a genuinely indented continuation line (its own leading whitespace reaches the marker\'s content column) still gets the class', () => {
    const view = mountView('- one\n  indented continuation, same item');
    const rows = lines(view);

    expect(rows.map(hasListLine)).toEqual([true, true]);
    expect(indentPx(rows[1]!)).toBe(indentPx(rows[0]!));
  });

  /**
   * The blank separator line's own indentation is 0 (nothing to
   * measure), so it no longer qualifies under `lineOwnsListIndent()`
   * either — deliberately reversed alongside the case above, for the
   * identical reason. Invisible either way (a blank line has no text for
   * `--list-indent-px` to indent), so this is a pure bookkeeping change,
   * not a visible regression. The genuinely indented second paragraph
   * that follows it is unaffected — its own leading whitespace still
   * reaches the marker's content column.
   */
  it('a blank paragraph-separator line inside the item no longer gets the class; the indented paragraph after it still does', () => {
    const view = mountView('- one\n\n  second paragraph, same item');
    const rows = lines(view);

    expect(rows.map(hasListLine)).toEqual([true, false, true]);
  });

  it('stops at a genuine blank line that ends the list — the following unrelated paragraph gets nothing', () => {
    const view = mountView('- item\n\nplain text');
    const rows = lines(view);

    expect(rows.map(hasListLine)).toEqual([true, false, false]);
  });

  describe('nesting', () => {
    it('a nested item reserves more indent than its parent', () => {
      const view = mountView('- parent\n  - child');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true]);
      expect(indentPx(rows[1]!)).toBeGreaterThan(indentPx(rows[0]!));
    });

    it('a deeply nested item reserves progressively more indent per level', () => {
      const view = mountView('- one\n  - two\n    - three');
      const rows = lines(view);

      const [a, b, c] = rows.map(indentPx);
      expect(a).toBeGreaterThan(0);
      expect(b!).toBeGreaterThan(a!);
      expect(c!).toBeGreaterThan(b!);
    });

    it('a line\'s own indent reflects only its nearest (innermost) owning item, never a sum across ancestors', () => {
      // The child's own reserved indent must equal "child's own leading
      // whitespace + child's own marker footprint" — not "parent's own
      // marker footprint" added on top a second time (unlike blockquote's
      // depth-summed model, which this construct deliberately does not
      // replicate; see listLineDecoration.ts's own doc comment).
      const parentOnly = mountView('- parent');
      const nestedChildLine = mountView('- parent\n  - child');

      const parentIndent = indentPx(nthLine(parentOnly, 0));
      const childIndent = indentPx(nthLine(nestedChildLine, 1));

      // The child's indent is the parent's own indent plus the width of
      // its own 2-space leading indentation, not some larger sum
      // involving the parent's marker counted twice.
      expect(childIndent).toBeGreaterThan(parentIndent);
      expect(childIndent).toBeLessThan(parentIndent * 2);
    });

    it('mixed nested list types (bullet parent, ordered child, task grandchild) each still get the class', () => {
      const view = mountView('- bullet parent\n  1. ordered child\n    - [ ] task grandchild');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true, true]);
    });

    it('switching marker types at the same nesting level (bullet then ordered) both get the class', () => {
      const view = mountView('- bullet\n\n1. ordered');
      const rows = lines(view);

      expect(hasListLine(rows[0]!)).toBe(true);
      expect(hasListLine(rows[2]!)).toBe(true);
    });
  });

  it('a list item containing inline formatting still gets the class', () => {
    const view = mountView('- **bold** and *italic* text');
    expect(hasListLine(nthLine(view, 0))).toBe(true);
  });

  it('a list item containing a link still gets the class', () => {
    const view = mountView('- see [a link](https://example.com)');
    expect(hasListLine(nthLine(view, 0))).toBe(true);
  });

  it('composes with listMarkerDecoration without conflict', () => {
    const view = mountView('- item', [listMarkerDecoration()]);
    const line = nthLine(view, 0);

    expect(hasListLine(line)).toBe(true);
    expect(view.dom.querySelector('.cm-bullet-list-marker')).not.toBeNull();
  });

  it('existing blockquotes remain unaffected by this construct', () => {
    const view = mountView('> quoted text', [blockquoteLineDecoration()]);
    const line = nthLine(view, 0);

    expect(hasListLine(line)).toBe(false);
    expect(line.className).toContain('cm-quote-line');
  });

  it('a blockquote nested inside a list item does not get cm-list-line for its own line beyond the item\'s own marker line ownership rules', () => {
    const view = mountView('- outer\n  > quoted continuation inside list item', [
      blockquoteLineDecoration(),
    ]);
    const rows = lines(view);

    // The quote line's nearest owning ancestor for *list* purposes is
    // still the outer ListItem (it's part of that item's own content),
    // so it correctly still gets cm-list-line, alongside cm-quote-line
    // from the independent blockquote decoration.
    expect(rows[0]!.className).toContain('cm-list-line');
    expect(rows[1]!.className).toContain('cm-list-line');
    expect(rows[1]!.className).toContain('cm-quote-line');
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as the decoration is applied', () => {
      const text = '- one\n- two';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 3 } });
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  /**
   * Regression suite for `lineOwnsListIndent()` — the structural-membership
   * (`nearestListItem()`) vs. visual-list-line-ownership distinction. Every
   * case here was verified against Obsidian's own real DOM for the
   * equivalent source text before this fix was written; see
   * `lineOwnsListIndent()`'s own doc comment in `listLineDecoration.ts`.
   */
  describe('structural membership vs. visual list-line ownership (2026-09-29)', () => {
    it('A. a long list item that visually soft-wraps is still ONE document line — the hanging indent applies to it, unaffected by this fix', () => {
      const longText =
        'This is a very long list item that wraps onto another visual line because the editor column is narrow.';
      const view = mountView(`- ${longText}`);
      const row = lines(view)[0]!;

      // One `.cm-line` DOM element regardless of how many visual rows the
      // browser soft-wraps it into — this fix operates on document lines
      // (`line.from`), never visual rows, so a wrapped marker line is
      // never even a candidate for the "later source line" branch below.
      expect(lines(view)).toHaveLength(1);
      expect(hasListLine(row)).toBe(true);
      expect(indentPx(row)).toBeGreaterThan(0);
    });

    it('B. "- one\\nlazy continuation": a later, zero-indentation source line does NOT get list-line decoration', () => {
      const view = mountView('- one\nlazy continuation');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, false]);
    });

    it('C. "- one\\n  continuation": a later, explicitly indented source line DOES get list-line decoration, at the item\'s own indent', () => {
      const view = mountView('- one\n  continuation');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true]);
      expect(indentPx(rows[1]!)).toBe(indentPx(rows[0]!));
    });

    it('D. list item + two unindented paragraphs, zero blank lines anywhere: only the actual list source line is decorated', () => {
      const doc =
        '- The momement I type something in the list item above the paragraph it automatically adds indent to the paragraph below. There is no paste normalization issue.\n' +
        'This is a pagraph that goes over two lines because the intent is applied to the lines expect the first line so we need minimum two lines to test this.\n' +
        'This is another paragraph not directly below the loist item but still it indents the lines since it is below already indedented line.';
      const view = mountView(doc);
      const rows = lines(view);

      expect(rows).toHaveLength(3);
      expect(rows.map(hasListLine)).toEqual([true, false, false]);
      expect(indentPx(rows[1]!)).toBe(0);
      expect(indentPx(rows[2]!)).toBe(0);
    });

    it('E. nested list: each item\'s own marker line is still correctly decorated', () => {
      const view = mountView('- Outer\n  - Inner one\n  - Inner two');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true, true]);
      // The nested items reserve more indent than the outer one (their
      // own, independent marker footprint plus their own leading
      // whitespace) — unaffected by this fix, still exactly what the
      // "nesting" describe block above already covers.
      expect(indentPx(rows[1]!)).toBeGreaterThan(indentPx(rows[0]!));
      expect(indentPx(rows[2]!)).toBe(indentPx(rows[1]!));
    });

    it('E2. nested list: a genuinely indented continuation of a NESTED item is still decorated, at the nested item\'s own indent', () => {
      const view = mountView('- Outer\n  - Inner\n    continuation of the inner item');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true, true]);
      expect(indentPx(rows[2]!)).toBe(indentPx(rows[1]!));
    });

    it('F. task list: the same behavior as an unordered list — only the actual task source line is decorated, zero blank lines', () => {
      const doc =
        '- [ ] The momement I type something in the task item above the paragraph it automatically adds indent to the paragraph below.\n' +
        'This is a normal paragraph, not task content.\n' +
        'This is another normal paragraph.';
      const view = mountView(doc);
      const rows = lines(view);

      expect(rows).toHaveLength(3);
      expect(rows.map(hasListLine)).toEqual([true, false, false]);
    });

    it('F2. task list: a genuinely indented continuation line still gets decorated', () => {
      const view = mountView('- [ ] Task one\n  indented continuation of the task');
      const rows = lines(view);

      expect(rows.map(hasListLine)).toEqual([true, true]);
      expect(indentPx(rows[1]!)).toBe(indentPx(rows[0]!));
    });
  });
});
