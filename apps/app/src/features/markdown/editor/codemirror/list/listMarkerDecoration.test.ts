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
 * indentation mechanism. `leadingIndentDecoration.ts`'s own
 * `IndentTokenWidget` renders a non-breaking-space placeholder per
 * collapsed leading-whitespace character (real, font-metric-driven
 * geometry — see that widget's own doc comment), so `textContent` still
 * carries one character per space; these tests assert on bullet count and
 * the absence of raw `-`/`*`/`+` marker characters rather than exact
 * `textContent` equality.
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

function bulletWidgets(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-bullet-list-marker'));
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
    ])('renders a bullet dot for every "%s" item at rest, source marker not in DOM text', (marker, text) => {
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(3);
      expect(view.dom.textContent).not.toContain(marker);
      expect(view.dom.textContent).toBe('•one•two•threeOther');
    });
  });

  describe('the marker stays rendered while editing the item\'s own text (engagement is marker-range-scoped, not line-scoped)', () => {
    it('cursor immediately after the marker (•|Text) stays concealed', () => {
      const text = '- Text';
      const view = mountView(text, 2); // right after "- ", before "Text"

      expect(view.dom.textContent).toBe('•Text');
      expect(bulletWidgets(view)).toHaveLength(1);
    });

    it('cursor in the middle of the text (•T|ext) stays concealed', () => {
      const view = mountView('- Text', 3);

      expect(view.dom.textContent).toBe('•Text');
    });

    it('cursor at the end of the text (•Text|) stays concealed', () => {
      const view = mountView('- Text', 6);

      expect(view.dom.textContent).toBe('•Text');
    });

    it('cursor at the very start of the line (before the marker) also stays concealed', () => {
      const view = mountView('- Text', 0);

      expect(view.dom.textContent).toBe('•Text');
    });

    it('a selection entirely within the item\'s text stays concealed', () => {
      const view = mountView('- Text', null);
      view.dispatch({ selection: { anchor: 2, head: 6 } }); // selects "Text"

      expect(view.dom.textContent).toBe('•Text');
    });

    it('reveals only when the selection genuinely overlaps the marker\'s own range', () => {
      const view = mountView('- Text', 0);

      // Cursor strictly inside the marker range (between "-" and the
      // separator space) — position 1 of "- Text".
      view.dispatch({ selection: { anchor: 1 } });
      expect(view.dom.textContent).toBe('- Text');

      view.dispatch({ selection: { anchor: 2 } }); // leaves the marker range
      expect(view.dom.textContent).toBe('•Text');
    });

    it('reveals when a selection spans into the marker range (e.g. Home then Shift+Right)', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 0, head: 1 } }); // selects "-"
      expect(view.dom.textContent).toBe('- Text');
    });

    it('a selection spanning from before the marker through the text reveals it (deleting it would remove the marker too)', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 0, head: 6 } });
      expect(view.dom.textContent).toBe('- Text');
    });

    it('engagement is per marker: cursor in one item\'s text never reveals a sibling item\'s marker', () => {
      const text = '- one\n- two\n- three';
      const view = mountView(text, text.indexOf('two') + 1); // inside "two"'s text

      expect(view.dom.textContent).toBe('•one•two•three');
    });

    it('re-collapses once the selection leaves the marker range', () => {
      const text = '- one\n- two\n\nOther';
      const view = mountView(text, 1); // inside the marker itself

      expect(view.dom.textContent).toBe('- one•twoOther');

      view.dispatch({ selection: { anchor: text.indexOf('Other') } });
      expect(view.dom.textContent).toBe('•one•twoOther');
    });
  });

  describe('mixed markers in one adjacent block', () => {
    it('"- one\\n* two\\n+ three": each item renders its own bullet independently of marker character', () => {
      const text = '- one\n* two\n+ three\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(3);
      expect(view.dom.textContent).toBe('•one•two•threeOther');
    });
  });

  describe('nested bullets', () => {
    it('parent/child/grandchild all render a bullet at rest', () => {
      const text = '- parent\n  - child\n    - grandchild\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(3);
      expect(view.dom.textContent).not.toMatch(/[-*+]/);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
      expect(view.dom.textContent).toContain('grandchild');
    });

    it('editing text in the child item never reveals the parent\'s, child\'s, or grandchild\'s marker', () => {
      const text = '- parent\n  - child\n    - grandchild';
      const view = mountView(text, text.indexOf('child') + 1); // inside "child"'s text

      expect(view.dom.textContent).not.toMatch(/[-*+]/);
      expect(bulletWidgets(view)).toHaveLength(3);
    });

    it('placing the cursor inside the child\'s own marker range reveals only that marker', () => {
      const text = '- parent\n  - child\n    - grandchild';
      const childMarkerPos = text.indexOf('  - child') + 3; // the "-" of the child's own marker
      const view = mountView(text, childMarkerPos);

      expect(view.dom.textContent).toContain('- child');
      expect(view.dom.textContent).not.toContain('- parent');
      expect(view.dom.textContent).not.toContain('- grandchild');
      expect(bulletWidgets(view)).toHaveLength(2);
    });

    it('a wider indentation width (4 spaces) still nests and renders correctly', () => {
      const text = '- parent\n    - child\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(2);
      expect(view.dom.textContent).not.toMatch(/[-*+]/);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
    });
  });

  describe('list boundaries', () => {
    it('a bullet item followed by a blank line and a plain paragraph: only the item gets a bullet', () => {
      const text = '- item\n\nnormal paragraph';
      const view = mountView(text, text.indexOf('normal'));

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe('•itemnormal paragraph');
    });

    it('a plain paragraph followed by a bullet item: only the item gets a bullet', () => {
      const text = 'normal paragraph\n\n- item';
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe('normal paragraph•item');
    });

    it('a bullet item immediately followed by an unmarked paragraph line (no blank line) still only bullets the item', () => {
      // "- item\nnormal paragraph\n- another item" — CommonMark: the plain
      // line becomes lazy-continuation text *inside* the first item's own
      // Paragraph (no blank line to end the list), then a second real
      // ListItem follows.
      const text = '- item\nnormal paragraph\n- another item';
      const view = mountView(text, text.indexOf('normal'));

      expect(bulletWidgets(view)).toHaveLength(2);
    });
  });

  it('multiple independent lists separated by a paragraph both render bullets, independently engaged', () => {
    const text = '- a\n- b\n\nparagraph\n\n- c\n- d';
    const view = mountView(text, text.indexOf('paragraph'));

    expect(bulletWidgets(view)).toHaveLength(4);
    expect(view.dom.textContent).toBe('•a•bparagraph•c•d');
  });

  describe('editing', () => {
    it('deleting the marker character removes the bullet rendering for that line', () => {
      const text = '- one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      expect(bulletWidgets(view)).toHaveLength(1);

      // Delete the "-" itself (position 0..1).
      view.dispatch({ changes: { from: 0, to: 1 } });

      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.state.doc.toString()).toBe(' one\n\nOther');
    });

    it('typing "- " at the start of a plain line turns it into a rendered bullet once the caret leaves', () => {
      const view = mountView('one\n\nOther', 'one\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- ' } });

      expect(view.state.doc.toString()).toBe('- one\n\nOther');
      expect(bulletWidgets(view)).toHaveLength(1);
    });

    it('pasting (programmatic insert) a bullet list renders it identically to typed text', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- one\n- two' } });

      expect(bulletWidgets(view)).toHaveLength(2);
    });

    it('undo restores the prior text and, with it, the prior bullet rendering', () => {
      const text = '- one\n\nOther';
      const view = mountViewWithHistory(text, text.indexOf('Other'));
      expect(bulletWidgets(view)).toHaveLength(1);

      view.dispatch({ changes: { from: 0, to: 2 } }); // delete "- "
      expect(view.state.doc.toString()).toBe('one\n\nOther');
      expect(bulletWidgets(view)).toHaveLength(0);

      undo(view);

      expect(view.state.doc.toString()).toBe(text);
      expect(bulletWidgets(view)).toHaveLength(1);
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

      // Pinning existing upstream behavior as-is, per this pass's explicit
      // scope boundary — not this pass's concern to change. (This is the
      // top-level, first-line case; docs/editor-architecture-decisions.md's
      // deferred list-editing-policy note covers the "replace marker with
      // blank space" branch seen in a continuation-line context — a
      // separate, future change, not this one.)
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

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe('> •itemOther');
    });

    it('a bullet list and a blockquote alternating at the top level each render independently', () => {
      const text = '- item\n> quote\n- another item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(2);
    });
  });

  describe('interaction with indentation rendering (leadingIndentDecoration.ts)', () => {
    it('a nested item\'s leading indentation and its own bullet both render, without conflicting or duplicating', () => {
      const text = '- parent\n  - child\n\nOther';
      const view = mountViewWithIndent(text, text.indexOf('Other'));

      // Exactly one bullet widget per item, and leadingIndentDecoration.ts's
      // own indent-token widgets are present for the child's leading
      // whitespace — the two mechanisms compose without either
      // double-decorating the same range or fighting over it.
      expect(bulletWidgets(view)).toHaveLength(2);
      expect(view.dom.querySelectorAll('.cm-indent-token')).toHaveLength(2); // "  " before child's marker
      expect(view.dom.textContent).not.toMatch(/[-*+]/);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
    });
  });

  describe('separator whitespace — canonical and non-canonical widths', () => {
    it.each(['- Text', '-  Text', '-   Text'])(
      '%s: no stray visible space between the bullet and the text',
      (text) => {
        const view = mountView(text, 0);

        expect(view.dom.textContent).toBe('•Text');
        expect(bulletWidgets(view)).toHaveLength(1);
        expect(view.state.doc.toString()).toBe(text); // document unchanged regardless of separator width
      }
    );

    it('a cursor placed right after the full separator (any width) stays concealed, not just for the canonical 1-space case', () => {
      const view = mountView('-  Text', 3); // right after "-  ", before "Text"

      expect(view.dom.textContent).toBe('•Text');
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

      expect(bulletWidgets(view)).toHaveLength(1); // nested only — outer bare marker stays raw
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('exclusions: not this slice\'s concern', () => {
    it('ordered-list markers ("1.") are never turned into a bullet', () => {
      const text = '1. one\n2. two';
      const view = mountView(text, text.length);

      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('task-list items ("- [ ] …") are left completely unrendered, not partially bulleted', () => {
      const text = '- [ ] todo\n- [x] done';
      const view = mountView(text, text.length);

      expect(bulletWidgets(view)).toHaveLength(0);
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
   */
  describe('bare marker (no separator, no content) does not render a bullet', () => {
    it.each(['-', '*', '+'])('a lone "%s" at document end renders raw, not as a bullet', (marker) => {
      const view = mountView(marker, 0);

      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(marker);
    });

    it.each(['-', '*', '+'])('"%s" followed by a blank line (nothing on its own line) still renders raw', (marker) => {
      const text = `${marker}\n\nOther`;
      const view = mountView(text, text.indexOf('Other'));

      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it.each([
      ['2 spaces', '  -'],
      ['4 spaces', '    -'],
      ['8 spaces', '        -'],
    ])('indented bare marker (%s) still renders raw — no bullet appears merely because it is nested-looking', (_label, text) => {
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(text);
    });

    it('typing "-" alone does not immediately render a bullet — only after the separator space is typed', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '-' } });
      expect(bulletWidgets(view)).toHaveLength(0);
      expect(view.dom.textContent.startsWith('-')).toBe(true);

      view.dispatch({ changes: { from: 1, insert: ' ' } });
      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent.startsWith('•')).toBe(true);

      view.dispatch({ changes: { from: 2, insert: 'Text' } });
      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent.startsWith('•Text')).toBe(true);
    });
  });

  describe('marker + separator (no content yet) DOES render a bullet — only a truly bare marker is excluded', () => {
    it.each(['- ', '* ', '+ '])('"%s" (marker plus separator space, empty item) renders a bullet', (text) => {
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe('•');
    });

    it.each([
      ['2 spaces', '  - ', '  •'],
      ['4 spaces', '    - ', '    •'],
    ])('indented marker + separator (%s) renders a bullet', (_label, text, expected) => {
      // mountView() doesn't compose leadingIndentDecoration.ts, so leading
      // whitespace renders literally here — only the marker itself
      // collapses to the bullet widget.
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe(expected);
    });
  });

  describe('marker + content — unaffected by the bare-marker fix, decoration range unchanged', () => {
    it.each(['- Text', '* Text', '+ Text'])('"%s" renders a bullet with the content immediately after', (text) => {
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe('•Text');
    });

    it.each(['-   Text', '*   Text', '+   Text'])(
      '"%s" (multi-space separator) still renders a bullet, existing range behavior preserved',
      (text) => {
        const view = mountView(text, 0);

        expect(bulletWidgets(view)).toHaveLength(1);
        expect(view.dom.textContent).toBe('•Text');
        expect(view.state.doc.toString()).toBe(text);
      }
    );

    it.each([
      ['2 spaces', '  - Text', '  •Text'],
      ['4 spaces', '    - Text', '    •Text'],
    ])('indented marker + content (%s) renders a bullet', (_label, text, expected) => {
      const view = mountView(text, 0);

      expect(bulletWidgets(view)).toHaveLength(1);
      expect(view.dom.textContent).toBe(expected);
    });

    it('nested list ("- Parent\\n  - Child") is unaffected — both markers have real separators', () => {
      const text = '- Parent\n  - Child';
      const view = mountView(text, text.length);

      expect(bulletWidgets(view)).toHaveLength(2);
      expect(view.dom.textContent).toBe('•Parent  •Child'); // leading indent renders literally without leadingIndentDecoration.ts composed
    });
  });

  describe('cursor engagement is unaffected by the eligibility change', () => {
    it('"- Text": engagement/reveal behavior around the marker is identical to before', () => {
      const view = mountView('- Text', 0);

      view.dispatch({ selection: { anchor: 1 } }); // strictly inside the marker
      expect(view.dom.textContent).toBe('- Text');

      view.dispatch({ selection: { anchor: 2 } }); // leaves the marker range
      expect(view.dom.textContent).toBe('•Text');
    });

    it('"-   Text" (multi-space separator): engagement/reveal behavior is identical to before', () => {
      const view = mountView('-   Text', 0);

      view.dispatch({ selection: { anchor: 1 } });
      expect(view.dom.textContent).toBe('-   Text');

      view.dispatch({ selection: { anchor: 4 } }); // right after the full separator
      expect(view.dom.textContent).toBe('•Text');
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

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic', () => {
      // "- " occupies [0, 2) — no EditorView.atomicRanges registered for
      // this decoration, same as heading/emphasis.
      const text = '- one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      view.dispatch({ selection: { anchor: 1 } });

      expect(view.state.selection.main.head).toBe(1);
    });

    it('does not affect plain text with no list', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
      expect(bulletWidgets(view)).toHaveLength(0);
    });
  });
});
