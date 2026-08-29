// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deleteCharForward, history, undo } from '@codemirror/commands';
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { leadingIndentDecoration } from '../highlight/leadingIndentDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listMarkerDecoration } from './listMarkerDecoration';

/**
 * Mirrors headingMarkerDecoration.test.ts's/blockquoteMarkerDecoration.test.ts's
 * mountView. `initialAnchor` of `null` means "document start" — position 0
 * is inside the first construct's own range for most fixtures below, so
 * genuinely at-rest tests place the caret on a separate trailing "Other"
 * line instead (same convention those two files use), never at `null`.
 */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), listMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

/** Same as mountView, plus @codemirror/commands' history() — only the undo test needs it. */
function mountViewWithHistory(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), listMarkerDecoration(), history()],
  });
  return new EditorView({ state, parent });
}

/**
 * Same as mountView, plus leadingIndentDecoration() — for tests that
 * specifically exercise composition with the existing, construct-agnostic
 * indentation mechanism.
 */
function mountViewWithIndent(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), listMarkerDecoration(), leadingIndentDecoration()],
  });
  return new EditorView({ state, parent });
}

/**
 * The real marker + separator text is now always present in
 * `view.dom.textContent` — this construct's `Decoration.mark`-based
 * migration (2026-08-29, see listMarkerDecoration.ts's own doc comment for
 * why: a `Decoration.replace` widget was found to create a caret-boundary
 * defect a real, source-backed marker doesn't have). So "concealed" (i.e.
 * rendered as a bullet) is asserted via the `.cm-bullet-list-marker--concealed`
 * class, never via `textContent` exclusion — mirrors
 * blockquoteMarkerDecoration.test.ts's own convention exactly.
 */
function markerSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-bullet-list-marker'));
}

function concealedMarkerTexts(view: EditorView): string[] {
  return markerSpans(view)
    .filter((s) => s.classList.contains('cm-bullet-list-marker--concealed'))
    .map((s) => s.textContent ?? '');
}

function revealedMarkerTexts(view: EditorView): string[] {
  return markerSpans(view)
    .filter((s) => !s.classList.contains('cm-bullet-list-marker--concealed'))
    .map((s) => s.textContent ?? '');
}

/**
 * CM6 renders each document line as its own `.cm-line` block-level `<div>`
 * with no inserted newline text node between them — `view.dom.textContent`
 * therefore never contains `\n` even for a genuinely multi-line document.
 * Every "full document text" assertion below compares against this, not
 * against the original `\n`-joined source string.
 */
function withoutNewlines(text: string): string {
  return text.replace(/\n/g, '');
}

describe('listMarkerDecoration', () => {
  describe('basic bullets, one marker character at a time', () => {
    it.each([
      ['-', '- one\n- two\n- three\n\nOther'],
      ['*', '* one\n* two\n* three\n\nOther'],
      ['+', '+ one\n+ two\n+ three\n\nOther'],
    ])('renders a concealed (bulleted) marker for every "%s" item at rest, real marker text still in the DOM', (marker, text) => {
      const view = mountView(text, text.indexOf('Other'));

      expect(markerSpans(view)).toHaveLength(3);
      expect(concealedMarkerTexts(view)).toEqual([`${marker} `, `${marker} `, `${marker} `]);
      expect(revealedMarkerTexts(view)).toEqual([]);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });
  });

  describe('the marker stays concealed while editing the item\'s own text (engagement is marker-range-scoped, not line-scoped)', () => {
    it('cursor immediately after the marker (•|Text) stays concealed', () => {
      const text = '- Text';
      const view = mountView(text, 2); // right after "- ", before "Text"

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(revealedMarkerTexts(view)).toEqual([]);
    });

    it('cursor in the middle of the text (•T|ext) stays concealed', () => {
      const view = mountView('- Text', 3);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('cursor at the end of the text (•Text|) stays concealed', () => {
      const view = mountView('- Text', 6);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('cursor at the very start of the line (before the marker) also stays concealed', () => {
      const view = mountView('- Text', 0);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('a selection entirely within the item\'s text stays concealed', () => {
      const view = mountView('- Text', null);
      view.dispatch({ selection: { anchor: 2, head: 6 } }); // selects "Text"

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('reveals only when the selection genuinely overlaps the marker\'s own range', () => {
      const view = mountView('- Text', 0);

      // Cursor strictly inside the marker range (between "-" and the
      // separator space) — position 1 of "- Text".
      view.dispatch({ selection: { anchor: 1 } });
      expect(revealedMarkerTexts(view)).toEqual(['- ']);
      expect(concealedMarkerTexts(view)).toEqual([]);

      view.dispatch({ selection: { anchor: 2 } }); // leaves the marker range
      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(revealedMarkerTexts(view)).toEqual([]);
    });

    it('reveals when a selection spans into the marker range (e.g. Home then Shift+Right)', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 0, head: 1 } }); // selects "-"
      expect(revealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('a selection spanning from before the marker through the text reveals it (deleting it would remove the marker too)', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 0, head: 6 } });
      expect(revealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('engagement is per marker: cursor in one item\'s text never reveals a sibling item\'s marker', () => {
      const text = '- one\n- two\n- three';
      const view = mountView(text, text.indexOf('two') + 1); // inside "two"'s text

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ', '- ']);
      expect(revealedMarkerTexts(view)).toEqual([]);
    });

    it('re-collapses once the selection leaves the marker range', () => {
      const text = '- one\n- two\n\nOther';
      const view = mountView(text, 1); // inside the marker itself

      expect(revealedMarkerTexts(view)).toEqual(['- ']);
      expect(concealedMarkerTexts(view)).toEqual(['- ']);

      view.dispatch({ selection: { anchor: text.indexOf('Other') } });
      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
      expect(revealedMarkerTexts(view)).toEqual([]);
    });
  });

  describe('mixed markers in one adjacent block', () => {
    it('"- one\\n* two\\n+ three": each item renders its own bullet independently of marker character', () => {
      const text = '- one\n* two\n+ three\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(concealedMarkerTexts(view)).toEqual(['- ', '* ', '+ ']);
    });
  });

  describe('nested bullets', () => {
    it('parent/child/grandchild all render a bullet at rest', () => {
      const text = '- parent\n  - child\n    - grandchild\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ', '- ']);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
      expect(view.dom.textContent).toContain('grandchild');
    });

    it('editing text in the child item never reveals the parent\'s, child\'s, or grandchild\'s marker', () => {
      const text = '- parent\n  - child\n    - grandchild';
      const view = mountView(text, text.indexOf('child') + 1); // inside "child"'s text

      expect(revealedMarkerTexts(view)).toEqual([]);
      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ', '- ']);
    });

    it('placing the cursor inside the child\'s own marker range reveals only that marker', () => {
      const text = '- parent\n  - child\n    - grandchild';
      const childMarkerPos = text.indexOf('  - child') + 3; // the "-" of the child's own marker
      const view = mountView(text, childMarkerPos);

      expect(revealedMarkerTexts(view)).toEqual(['- ']);
      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
    });

    it('a wider indentation width (4 spaces) still nests and renders correctly', () => {
      const text = '- parent\n    - child\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
    });
  });

  describe('list boundaries', () => {
    it('a bullet item followed by a blank line and a plain paragraph: only the item gets a bullet', () => {
      const text = '- item\n\nnormal paragraph';
      const view = mountView(text, text.indexOf('normal'));

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('a plain paragraph followed by a bullet item: only the item gets a bullet', () => {
      const text = 'normal paragraph\n\n- item';
      const view = mountView(text, 0);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('a bullet item immediately followed by an unmarked paragraph line (no blank line) still only bullets the item', () => {
      // "- item\nnormal paragraph\n- another item" — CommonMark: the plain
      // line becomes lazy-continuation text *inside* the first item's own
      // Paragraph (no blank line to end the list), then a second real
      // ListItem follows.
      const text = '- item\nnormal paragraph\n- another item';
      const view = mountView(text, text.indexOf('normal'));

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  it('multiple independent lists separated by a paragraph both render bullets, independently engaged', () => {
    const text = '- a\n- b\n\nparagraph\n\n- c\n- d';
    const view = mountView(text, text.indexOf('paragraph'));

    expect(concealedMarkerTexts(view)).toEqual(['- ', '- ', '- ', '- ']);
    expect(view.dom.textContent).toBe(withoutNewlines(text));
  });

  describe('editing', () => {
    it('deleting the marker character removes the bullet rendering for that line', () => {
      const text = '- one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      expect(markerSpans(view)).toHaveLength(1);

      // Delete the "-" itself (position 0..1).
      view.dispatch({ changes: { from: 0, to: 1 } });

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.state.doc.toString()).toBe(' one\n\nOther');
    });

    it('typing "- " at the start of a plain line turns it into a rendered bullet once the caret leaves', () => {
      const view = mountView('one\n\nOther', 'one\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- ' } });

      expect(view.state.doc.toString()).toBe('- one\n\nOther');
      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('pasting (programmatic insert) a bullet list renders it identically to typed text', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- one\n- two' } });

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
    });

    it('undo restores the prior text and, with it, the prior bullet rendering', () => {
      const text = '- one\n\nOther';
      const view = mountViewWithHistory(text, text.indexOf('Other'));
      expect(markerSpans(view)).toHaveLength(1);

      view.dispatch({ changes: { from: 0, to: 2 } }); // delete "- "
      expect(view.state.doc.toString()).toBe('one\n\nOther');
      expect(markerSpans(view)).toHaveLength(0);

      undo(view);

      expect(view.state.doc.toString()).toBe(text);
      expect(markerSpans(view)).toHaveLength(1);
    });
  });

  describe('editing regression: the new concealment/engagement rule does not interfere with normal editing', () => {
    // Not testing any new editing behavior — these pin that this
    // decoration change alone doesn't break CM6/lang-markdown's existing
    // commands, which are explicitly out of scope for this pass.

    it('typing at the beginning of the item\'s own text still inserts normally', () => {
      const view = mountView('- Text', 2); // right after "- "
      view.dispatch({ changes: { from: 2, insert: 'New ' } });

      expect(view.state.doc.toString()).toBe('- New Text');
    });

    it('forward Delete right after the marker still deletes into the text, unaffected by concealment', () => {
      const view = mountView('- Text', 2);
      deleteCharForward(view);

      expect(view.state.doc.toString()).toBe('- ext');
    });

    it('Backspace right after the marker still runs CM6/lang-markdown\'s existing deleteMarkupBackward unchanged (not modified by this pass)', () => {
      const view = mountView('- Text', 2);
      deleteMarkupBackward(view);

      expect(view.state.doc.toString()).toBe('Text');
    });

    it('a selection inside the item\'s text can still be replaced by typing', () => {
      const view = mountView('- Text', null);
      view.dispatch({ selection: { anchor: 2, head: 6 } }); // "Text" selected
      view.dispatch({ changes: { from: 2, to: 6, insert: 'Word' } });

      expect(view.state.doc.toString()).toBe('- Word');
    });

    it('Enter in an item still runs CM6/lang-markdown\'s existing list-continuation command unchanged', () => {
      const view = mountView('- Text', 2);
      insertNewlineContinueMarkupCommand({ nonTightLists: false })(view);

      expect(view.state.doc.toString()).toBe('-\n- Text');
    });
  });

  describe('interaction with blockquotes', () => {
    it('"> - item": the bullet renders inside the blockquote, independent of the quote marker', () => {
      const text = '> - item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('a bullet list and a blockquote alternating at the top level each render independently', () => {
      const text = '- item\n> quote\n- another item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  describe('interaction with indentation rendering (leadingIndentDecoration.ts)', () => {
    it('a nested item\'s leading indentation and its own bullet both render, without conflicting or duplicating', () => {
      const text = '- parent\n  - child\n\nOther';
      const view = mountViewWithIndent(text, text.indexOf('Other'));

      // Exactly one marker span per item, and leadingIndentDecoration.ts's
      // own indent-token widgets are present for the child's leading
      // whitespace — the two mechanisms compose without either
      // double-decorating the same range or fighting over it.
      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
      expect(view.dom.querySelectorAll('.cm-indent-token')).toHaveLength(2); // "  " before child's marker
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
    });
  });

  describe('separator whitespace — canonical and non-canonical widths', () => {
    it.each(['- Text', '-  Text', '-   Text'])(
      '%s: the marker span carries exactly the marker plus its real separator, whatever its width',
      (text) => {
        const view = mountView(text, 0);
        const separatorWidth = text.indexOf('Text') - 1;

        expect(concealedMarkerTexts(view)).toEqual(['-' + ' '.repeat(separatorWidth)]);
        expect(view.state.doc.toString()).toBe(text); // document unchanged regardless of separator width
      }
    );

    it('a cursor placed right after the full separator (any width) stays concealed, not just for the canonical 1-space case', () => {
      const view = mountView('-  Text', 3); // right after "-  ", before "Text"

      expect(concealedMarkerTexts(view)).toEqual(['-  ']);
    });

    it('does not swallow a real line break when a marker\'s next sibling is a nested list on a later line', () => {
      // "-\n  - nested": the outer marker's own nextSibling is the nested
      // BulletList, not a same-line Paragraph — the separator range must
      // stop at the outer marker's own line end, never cross into the
      // nested list's line. Per the 2026-08-28 bare-marker fix, the outer
      // marker itself has nothing after it on its own physical line (the
      // nested list starts on the *next* line), so it now correctly
      // declines decoration too — only the nested item's own marker
      // (which does have a real separator on its own line) renders.
      const text = '-\n  - nested';
      const view = mountView(text, 0);

      expect(markerSpans(view)).toHaveLength(1); // nested only — outer bare marker stays raw
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('exclusions: not this slice\'s concern', () => {
    it('ordered-list markers ("1.") are never turned into a bullet', () => {
      const text = '1. one\n2. two';
      const view = mountView(text, text.length);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('task-list items ("- [ ] …") are left completely unrendered, not partially bulleted', () => {
      const text = '- [ ] todo\n- [x] done';
      const view = mountView(text, text.length);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });
  });

  describe('node shape, verified against the real installed parser', () => {
    it('a bullet ListItem\'s firstChild is always ListMark', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('- one\n- two');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'ListItem') {
          found = true;
          expect(cursor.node.firstChild?.name).toBe('ListMark');
        }
        if (cursor.firstChild()) {
          do {
            visit();
          } while (cursor.nextSibling());
          cursor.parent();
        }
      }
      visit();

      expect(found).toBe(true);
    });

    it('*, +, and - all parse to the identical ListMark/ListItem/BulletList node names', () => {
      const language = markdownLanguageExtension().language;
      for (const marker of ['-', '*', '+']) {
        const tree = language.parser.parse(`${marker} one`);
        const cursor = tree.cursor();
        expect(cursor.firstChild()).toBe(true);
        expect(cursor.name).toBe('BulletList');
        expect(cursor.firstChild()).toBe(true);
        expect(cursor.name).toBe('ListItem');
        expect(cursor.firstChild()).toBe(true);
        expect(cursor.name).toBe('ListMark');
      }
    });
  });

  /**
   * Locked behavior (2026-08-28): a bare marker with nothing after it on
   * its own physical line is a syntactically valid, complete, empty
   * `ListItem` per CommonMark (confirmed against the installed
   * `@lezer/markdown`: `ListMark[0,1)` for `"-"` is byte-identical to
   * `ListMark[0,1)` for `"- "`) — the parser is correctly producing a
   * `ListMark` for it, this is not a parser bug. But Clutter's Live
   * Preview should not visually replace it until the marker actually has
   * a separator/content after it, so the very first keystroke of typing
   * a list item doesn't flash a bullet before the marker is finished.
   * Unaffected by the `Decoration.mark` migration — this gate lives in
   * `getBulletMarkRange`, unchanged by which decoration kind consumes it.
   */
  describe('bare marker (no separator, no content) does not render a bullet', () => {
    it.each(['-', '*', '+'])('a lone "%s" at document end renders raw, not as a bullet', (marker) => {
      const view = mountView(marker, 0);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(marker);
    });

    it.each(['-', '*', '+'])('"%s" followed by a blank line (nothing on its own line) still renders raw', (marker) => {
      const text = `${marker}\n\nOther`;
      const view = mountView(text, text.indexOf('Other'));

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it.each([
      ['2 spaces', '  -'],
      ['4 spaces', '    -'],
      ['8 spaces', '        -'],
    ])('indented bare marker (%s) still renders raw — no bullet appears merely because it is nested-looking', (_label, text) => {
      const view = mountView(text, 0);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(text);
    });

    it('typing "-" alone does not immediately render a bullet — only after the separator space is typed', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '-' } });
      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent.startsWith('-')).toBe(true);

      view.dispatch({ changes: { from: 1, insert: ' ' } });
      expect(concealedMarkerTexts(view)).toEqual(['- ']);

      view.dispatch({ changes: { from: 2, insert: 'Text' } });
      expect(concealedMarkerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent.startsWith('- Text')).toBe(true);
    });
  });

  describe('marker + separator (no content yet) DOES render a bullet — only a truly bare marker is excluded', () => {
    it.each(['- ', '* ', '+ '])('"%s" (marker plus separator space, empty item) renders a bullet', (text) => {
      const view = mountView(text, 0);

      expect(concealedMarkerTexts(view)).toEqual([text]);
    });

    it.each([
      ['2 spaces', '  - '],
      ['4 spaces', '    - '],
    ])('indented marker + separator (%s) renders a bullet', (_label, text) => {
      // mountView() doesn't compose leadingIndentDecoration.ts, so leading
      // whitespace renders literally here — only the marker itself is decorated.
      const view = mountView(text, 0);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });
  });

  describe('marker + content — unaffected by the bare-marker fix, decoration range unchanged', () => {
    it.each(['- Text', '* Text', '+ Text'])('"%s" renders a bullet with the content immediately after', (text) => {
      const view = mountView(text, 0);
      const marker = text[0];

      expect(concealedMarkerTexts(view)).toEqual([`${marker} `]);
    });

    it.each(['-   Text', '*   Text', '+   Text'])(
      '"%s" (multi-space separator) still renders a bullet, existing range behavior preserved',
      (text) => {
        const view = mountView(text, 0);
        const marker = text[0];

        expect(concealedMarkerTexts(view)).toEqual([`${marker}   `]);
        expect(view.state.doc.toString()).toBe(text);
      }
    );

    it.each([
      ['2 spaces', '  - Text'],
      ['4 spaces', '    - Text'],
    ])('indented marker + content (%s) renders a bullet', (_label, text) => {
      const view = mountView(text, 0);

      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('nested list ("- Parent\\n  - Child") is unaffected — both markers have real separators', () => {
      const text = '- Parent\n  - Child';
      const view = mountView(text, text.length);

      expect(concealedMarkerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  describe('cursor engagement is unaffected by the eligibility change', () => {
    it('"- Text": engagement/reveal behavior around the marker is identical to before', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 1 } }); // strictly inside the marker
      expect(revealedMarkerTexts(view)).toEqual(['- ']);

      view.dispatch({ selection: { anchor: 2 } }); // leaves the marker range
      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('"-   Text" (multi-space separator): engagement/reveal behavior is identical to before', () => {
      const view = mountView('-   Text', 0);

      view.dispatch({ selection: { anchor: 1 } });
      expect(revealedMarkerTexts(view)).toEqual(['-   ']);

      view.dispatch({ selection: { anchor: 4 } }); // right after the full separator
      expect(concealedMarkerTexts(view)).toEqual(['-   ']);
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as bullets collapse/reveal', () => {
      const text = '- one\n- two';
      const view = mountView(text, text.length);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 2 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest concealed range is not atomic', () => {
      // "- " occupies [0, 2) — no EditorView.atomicRanges registered for
      // this decoration, same as heading/emphasis/blockquote.
      const text = '- one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      view.dispatch({ selection: { anchor: 1 } });

      expect(view.state.selection.main.head).toBe(1);
    });

    it('does not affect plain text with no list', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
      expect(markerSpans(view)).toHaveLength(0);
    });
  });

  describe('real caret mapping — the reason for the Decoration.mark migration', () => {
    // Regression coverage for the specific defect the migration fixed:
    // with a Decoration.replace widget, a click/selection resolving exactly
    // at content-start (marker.to, the position immediately before the
    // item's own text) was misidentified by liveMarkSelectionSnap.ts as
    // "inside the replaced range" and redirected backward. With a real,
    // source-backed marker there is no replaced range for any such snap
    // logic to exist at all — a selection set directly to content-start
    // simply stays there, with no decoration-layer involvement whatsoever.

    it('a selection set exactly at content-start (marker.to) stays there — no snap-back mechanism exists for a real marker', () => {
      const view = mountView('- Bullet 3', null);

      view.dispatch({ selection: { anchor: 2 } }); // content-start, right before "B"

      expect(view.state.selection.main.head).toBe(2);
      expect(concealedMarkerTexts(view)).toEqual(['- ']);
    });

    it('the same holds at a nested item\'s content-start', () => {
      const text = '* Bullet 1\n  * Bullet 2';
      const contentStart = text.indexOf('Bullet 2');
      const view = mountView(text, null);

      view.dispatch({ selection: { anchor: contentStart } });

      expect(view.state.selection.main.head).toBe(contentStart);
    });
  });
});
