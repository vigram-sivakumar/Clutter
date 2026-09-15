// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), blockSeparatorDecoration()],
  });
  return new EditorView({ state, parent });
}

function separatorHeights(view: EditorView): number[] {
  return Array.from(view.dom.querySelectorAll('.cm-block-separator')).map((el) =>
    parseInt((el as HTMLElement).style.height, 10)
  );
}

describe('blockSeparatorDecoration — physical-line boundaries', () => {
  it('gives every physical line of one Paragraph a 12px leading separator (line 1 excepted)', () => {
    const view = mountView('Line one\nLine two\nLine three');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('gives 12px between two separate paragraphs (through their blank line)', () => {
    const view = mountView('Paragraph A\n\nParagraph B');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('gives no leading separator before the very first line of the document', () => {
    const view = mountView('First line\nSecond line');
    expect(separatorHeights(view)).toEqual([12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — empty lines stay stable under typing', () => {
  it('typing into an existing blank line never changes the separator count or heights', () => {
    const view = mountView('Line A\n\nLine B');
    expect(separatorHeights(view)).toEqual([12, 12]);

    const from = view.state.doc.toString().indexOf('\n\n') + 1;
    view.dispatch({ changes: { from, insert: 'Something' } });

    expect(view.state.doc.toString()).toBe('Line A\nSomething\nLine B');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('deleting the typed text back down to empty restores the same separators', () => {
    const view = mountView('Line A\nSomething\nLine B');
    expect(separatorHeights(view)).toEqual([12, 12]);

    const from = view.state.doc.toString().indexOf('Something');
    view.dispatch({ changes: { from, to: from + 'Something'.length, insert: '' } });

    expect(view.state.doc.toString()).toBe('Line A\n\nLine B');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('multiple consecutive empty lines each contribute their own 12px, accumulating', () => {
    const view = mountView('Line A\n\n\nLine B');
    expect(separatorHeights(view)).toEqual([12, 12, 12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — lists', () => {
  it('gives 6px between tight list items, and 12px before/after the whole list', () => {
    // A blank line is needed before "Below" to actually exit the list —
    // unindented text immediately after the last item, with no blank
    // line, lazily continues that item's own paragraph per CommonMark
    // (confirmed against the real parser), not a list-exit.
    const view = mountView('Above\n- Item 1\n- Item 2\n- Item 3\n\nBelow');
    expect(separatorHeights(view)).toEqual([12, 6, 6, 12, 12]);
    view.destroy();
  });

  it('gives the identical internal gaps for a loose list — the blank lines inside it still resolve as inside, so they stay 6px, not 12px', () => {
    const view = mountView('Above\n- Item 1\n\n- Item 2\n\n- Item 3\n\nBelow');
    expect(separatorHeights(view)).toEqual([12, 6, 6, 6, 6, 12, 12]);
    view.destroy();
  });

  it('keeps a nested list at 6px throughout — parent/nested boundaries never jump to 12px', () => {
    const view = mountView('- Parent item\n  - Nested item 1\n  - Nested item 2\n- Parent item 2');
    expect(separatorHeights(view)).toEqual([6, 6, 6]);
    view.destroy();
  });

  it('gives 12px after a bullet list when the immediately-following, non-indented line lazily continues into the list in the raw parse tree but is not genuinely part of it — the reported bug', () => {
    const view = mountView('- Item 1\n- Item 2\n- Item 3\nBelow');
    expect(separatorHeights(view)).toEqual([6, 6, 12]);
    view.destroy();
  });

  it('gives 12px after an ordered list under the same no-blank-line lazy-continuation condition', () => {
    const view = mountView('1. Item 1\n2. Item 2\n3. Item 3\nBelow');
    expect(separatorHeights(view)).toEqual([6, 6, 12]);
    view.destroy();
  });

  it('gives 12px after a task list under the same no-blank-line lazy-continuation condition', () => {
    const view = mountView('- [ ] Task 1\n- [x] Task 2\nBelow');
    expect(separatorHeights(view)).toEqual([6, 12]);
    view.destroy();
  });

  it('a genuinely indented continuation line after the last list item still stays grouped at 6px — only non-indented, non-genuine continuations are affected', () => {
    const view = mountView('- Item 1\n- Item 2\n  Indented continuation');
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('gives 6px between consecutive task-list items, regardless of checked state', () => {
    const view = mountView('- [ ] Task 1\n- [x] Task 2\n- [ ] Task 3');
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('gives 6px between task-list items across different bullet markers, same as plain bullet items', () => {
    const view = mountView('- [ ] Task 1\n+ [ ] Task 2\n* [ ] Task 3');
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — unordered-list marker family', () => {
  it('1. gives 6px between adjacent BulletList instances that use different markers, with no blank lines', () => {
    const view = mountView('- A\n+ B\n* C');
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('2. gives 6px throughout a run of multiple marker-change groups, each with multiple items', () => {
    const view = mountView('- A\n- B\n+ C\n+ D\n* E\n* F');
    expect(separatorHeights(view)).toEqual([6, 6, 6, 6, 6]);
    view.destroy();
  });

  it('3. bridges a marker change across a single blank line — the family relationship survives the blank line, not just adjacency', () => {
    const view = mountView('- A\n\n+ B\n\n* C');
    expect(separatorHeights(view)).toEqual([6, 6, 6, 6]);
    view.destroy();
  });

  it('4. bridges a marker change across multiple consecutive blank lines — no accidental 12px break', () => {
    const view = mountView('- A\n\n\n+ B');
    expect(separatorHeights(view)).toEqual([6, 6, 6]);
    view.destroy();
  });

  it('5. a same-marker list (single BulletList instance, the pre-existing case) is unaffected: still 6px internally', () => {
    const view = mountView('- A\n- B\n- C\n- D');
    expect(separatorHeights(view)).toEqual([6, 6, 6]);
    view.destroy();
  });

  it('6. an unordered list exiting to a paragraph still gets normal 12px — the family rule never fires on a real exit', () => {
    const view = mountView('- A\n- B\n\nParagraph');
    expect(separatorHeights(view)).toEqual([6, 12, 12]);
    view.destroy();
  });

  it('7. a paragraph entering an unordered list still gets normal 12px — the family rule never fires on a real entry', () => {
    const view = mountView('Paragraph\n\n- A\n- B');
    expect(separatorHeights(view)).toEqual([12, 12, 6]);
    view.destroy();
  });

  it('8. BulletList -> OrderedList is unaffected by the family rule (different families; ordered-list behavior is out of scope for this change)', () => {
    const noBlank = mountView('- A\n1. B');
    expect(separatorHeights(noBlank)).toEqual([12]);
    noBlank.destroy();

    const withBlank = mountView('- A\n\n1. B');
    expect(separatorHeights(withBlank)).toEqual([12, 12]);
    withBlank.destroy();
  });

  it('9. OrderedList -> BulletList is unaffected by the family rule (different families; ordered-list behavior is out of scope for this change)', () => {
    const noBlank = mountView('1. A\n- B');
    expect(separatorHeights(noBlank)).toEqual([12]);
    noBlank.destroy();

    const withBlank = mountView('1. A\n\n- B');
    expect(separatorHeights(withBlank)).toEqual([12, 12]);
    withBlank.destroy();
  });

  it('10. does not bridge across a heading sitting between two BulletList instances — the heading is real, non-blank content', () => {
    const view = mountView('- A\n# Heading\n+ B');
    // "- A" -> "# Heading": the heading is genuinely entered (36), not a
    // family bridge. "# Heading" -> "+ B": a normal heading-exit, 12 —
    // never 6, since the family rule's blank-line branch never applies
    // to a real content line.
    expect(separatorHeights(view)).toEqual([36, 12]);
    view.destroy();
  });

  it('11. does not bridge across an ordinary paragraph sitting between two BulletList instances', () => {
    // Blank lines on both sides are required to make "Paragraph" a real,
    // separate top-level `Paragraph` node — without them, unindented text
    // immediately after a list item with no blank line lazily continues
    // that item's own paragraph per CommonMark (see the list-family test
    // just below this one), which is a different, already-correct case
    // handled by rule 1, not this rule.
    const view = mountView('- A\n\nParagraph\n\n+ B');
    expect(separatorHeights(view)).toEqual([12, 12, 12, 12]);
    view.destroy();
  });

  it('a paragraph lazily continuing a list item (no blank line) gets 12px on both sides — it is not genuinely grouped with the list, so rule 1 must not grant it 6px, and it is not a real list item either, so the family rule must not bridge across it', () => {
    const view = mountView('- A\nParagraph\n+ B');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('12. nested lists remain governed by the existing shared-ancestor 6px behavior, unaffected by the new family rule', () => {
    const view = mountView('- Parent item\n  - Nested item 1\n  - Nested item 2\n- Parent item 2');
    expect(separatorHeights(view)).toEqual([6, 6, 6]);
    view.destroy();
  });

  it('a mixed-marker list nested inside a blockquote stays 6px throughout via the shared-ancestor rule', () => {
    const view = mountView('> Quote\n> - Item 1\n> + Item 2');
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — blockquotes', () => {
  it('gives no separator at all (0px — no widget) between physical lines of the same contiguous quoted paragraph, keeping the vertical quote bar visually unbroken; still 12px before/after the whole quote', () => {
    const view = mountView('Above\n> Quote line 1\n> Quote line 2\n> Quote line 3\n\nBelow');
    // Only 3 elements, not 5 — the two contiguous-paragraph boundaries
    // between the quote lines emit no `.cm-block-separator` at all (0px
    // means no widget, same as the Table/FencedCode atomic case), so
    // they simply don't appear here rather than showing up as `0`.
    expect(separatorHeights(view)).toEqual([12, 12, 12]);
    view.destroy();
  });

  it('keeps a genuine break inside a quote (a blank quoted line starting a new paragraph) at 6px — only genuinely contiguous lines get no separator at all', () => {
    const view = mountView('> Quote line one\n> Quote line two\n>\n> Quote line three');
    // Line 1 -> line 2 is the contiguous case (no element, see the test
    // above); the other two boundaries are real breaks and keep 6px.
    expect(separatorHeights(view)).toEqual([6, 6]);
    view.destroy();
  });

  it('keeps a nested blockquote at 6px throughout — every boundary here crosses a real break (a blank quoted line or a nested-quote transition), never two lines of one contiguous paragraph', () => {
    const view = mountView('> Quote\n>\n> > Nested quote\n> >\n> > More nested\n>\n> Back to outer');
    expect(separatorHeights(view)).toEqual([6, 6, 6, 6, 6, 6]);
    view.destroy();
  });

  it('a list inside a blockquote stays 6px throughout', () => {
    const view = mountView('> Quote\n> - Item 1\n> - Item 2\n> Back to quote text');
    expect(separatorHeights(view)).toEqual([6, 6, 6]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — tables', () => {
  it('gives 0px between every table row/line (no widget at all), and normal 12px before/after the whole table', () => {
    // GFM table rows lazily continue too (confirmed against the real
    // parser) — a blank line is needed before "Below" to actually exit.
    const view = mountView('Above\n| a | b |\n| - | - |\n| 1 | 2 |\n\nBelow');
    expect(separatorHeights(view)).toEqual([12, 12, 12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — fenced code', () => {
  it('never emits a separator inside a fenced code block, but the exit transition still gets its normal 12px', () => {
    const view = mountView('Above\n```\nline one\nline two\n```\nBelow');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — Image/Embed', () => {
  it('an image alone on its own line gets normal 12px from its neighbors, no separate intra-line handling', () => {
    const view = mountView('Above\n![img](https://example.com/a.png)\nBelow');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('inserts separators on both sides of an inline image sitting mid-paragraph', () => {
    const view = mountView('before ![alt](https://example.com/a.png) after');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('does not double up between the physical-line boundary and the intra-line boundary for an inline image', () => {
    const view = mountView('Above\nbefore ![img](https://example.com/a.png) after\nBelow');
    // Above->line2 and line2->Below are the two physical-line boundaries
    // (12 each); before/after the image are two more, same-line ones (12
    // each) — four total, none doubled.
    expect(separatorHeights(view)).toEqual([12, 12, 12, 12]);
    view.destroy();
  });

  it('inserts exactly one separator between two images sharing one physical line with no gap', () => {
    const view = mountView('![a](https://example.com/a.png)![b](https://example.com/b.png)');
    expect(separatorHeights(view)).toEqual([12]);
    view.destroy();
  });

  it('inserts only a leading separator when text precedes the image but nothing follows on that line', () => {
    const view = mountView('before ![alt](https://example.com/a.png)');
    expect(separatorHeights(view)).toEqual([12]);
    view.destroy();
  });

  it('inserts only a trailing separator when text follows the image but nothing precedes it on that line', () => {
    const view = mountView('![alt](https://example.com/a.png) after');
    expect(separatorHeights(view)).toEqual([12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — heading hierarchy', () => {
  it('gives 36px above an H1 (ATX), and normal 12px below it', () => {
    const view = mountView('Paragraph\n# Heading 1\nParagraph');
    expect(separatorHeights(view)).toEqual([36, 12]);
    view.destroy();
  });

  it('gives 30px above an H2 (ATX)', () => {
    const view = mountView('Paragraph\n## Heading 2\nParagraph');
    expect(separatorHeights(view)).toEqual([30, 12]);
    view.destroy();
  });

  it('gives 24px above an H3 (ATX)', () => {
    const view = mountView('Paragraph\n### Heading 3\nParagraph');
    expect(separatorHeights(view)).toEqual([24, 12]);
    view.destroy();
  });

  it('gives 18px above H4/H5/H6 (ATX)', () => {
    const h4 = mountView('Paragraph\n#### Heading 4\nParagraph');
    expect(separatorHeights(h4)).toEqual([18, 12]);
    h4.destroy();

    const h5 = mountView('Paragraph\n##### Heading 5\nParagraph');
    expect(separatorHeights(h5)).toEqual([18, 12]);
    h5.destroy();

    const h6 = mountView('Paragraph\n###### Heading 6\nParagraph');
    expect(separatorHeights(h6)).toEqual([18, 12]);
    h6.destroy();
  });

  it('resolves consecutive headings by the heading being entered, not the one being left', () => {
    const view = mountView('# Heading 1\n## Heading 2\n### Heading 3');
    // Line 1 gets no leading separator (first line of doc). Line 2 enters
    // H2 (30), line 3 enters H3 (24) — never the departing heading's own
    // height.
    expect(separatorHeights(view)).toEqual([30, 24]);
    view.destroy();
  });

  it('a Setext H1 gets 36px above it, and its own internal text/underline boundary stays 12px', () => {
    const view = mountView('Paragraph\n\nHeading 1\n=========\n\nParagraph');
    // Boundaries: Paragraph->blank (12), blank->"Heading 1" text line
    // (entering SetextHeading1, 36), "Heading 1"->"=========" (internal
    // Setext boundary, unaffected, 12), "========="->blank (12),
    // blank->Paragraph (12).
    expect(separatorHeights(view)).toEqual([12, 36, 12, 12, 12]);
    view.destroy();
  });

  it('a Setext H2 gets 30px above it', () => {
    const view = mountView('Paragraph\n\nHeading 2\n---------\n\nParagraph');
    expect(separatorHeights(view)).toEqual([12, 30, 12, 12, 12]);
    view.destroy();
  });

  it('a heading immediately after a list stays list-exit 12px, and the heading nested inside a list item stays 6px (list grouping wins over heading hierarchy)', () => {
    const nested = mountView('- Item\n  # Heading');
    expect(separatorHeights(nested)).toEqual([6]);
    nested.destroy();

    // "Item"->blank (list-exit, 12, matching the existing list-exit rule
    // exercised elsewhere in this file), then blank->"# Heading" (no
    // shared list ancestor any more, so heading hierarchy applies: 36).
    const afterExit = mountView('- Item\n\n# Heading');
    expect(separatorHeights(afterExit)).toEqual([12, 36]);
    afterExit.destroy();
  });

  it('a heading nested inside a blockquote stays 6px (blockquote grouping wins over heading hierarchy)', () => {
    const view = mountView('> Quote\n> # Heading');
    expect(separatorHeights(view)).toEqual([6]);
    view.destroy();
  });

  it('does not apply heading hierarchy to a "#" line inside a fenced code block — atomic 0px is preserved', () => {
    const view = mountView('Above\n```\n# not a heading\nmore code\n```\nBelow');
    expect(separatorHeights(view)).toEqual([12, 12]);
    view.destroy();
  });

  it('does not apply heading hierarchy to a "#"-led row inside a table', () => {
    const view = mountView('Above\n| a | b |\n| - | - |\n| # | 2 |\n\nBelow');
    expect(separatorHeights(view)).toEqual([12, 12, 12]);
    view.destroy();
  });
});

describe('blockSeparatorDecoration — general', () => {
  it('does not affect the stored document text', () => {
    const text = 'before ![alt](https://example.com/a.png) after\n\n```\ncode\n```\n\n- Item 1\n- Item 2';
    const view = mountView(text);
    expect(view.state.doc.toString()).toBe(text);
    view.destroy();
  });
});
