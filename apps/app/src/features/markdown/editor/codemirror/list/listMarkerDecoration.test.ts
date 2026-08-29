// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deleteCharForward, history, undo } from '@codemirror/commands';
import { deleteMarkupBackward, insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { leadingIndentDecoration } from '../highlight/leadingIndentDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listMarkerDecoration } from './listMarkerDecoration';

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

/** Same as mountView, plus leadingIndentDecoration() — composition with the existing, construct-agnostic indentation mechanism. */
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
 * The marker is a real, source-backed `Decoration.mark` with no
 * reveal/conceal state at all (2026-08-29 migration, away from
 * `ListBulletWidget`'s `Decoration.replace`) — so unlike the old
 * `•`-rendering widget, there is exactly one rendered state, always. These
 * helpers find the marker span and read its real text directly; there is
 * no "concealed"/"revealed" distinction to assert on, and `textContent`
 * always equals the source verbatim.
 */
function markerSpans(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-bullet-list-marker'));
}

function markerTexts(view: EditorView): string[] {
  return markerSpans(view).map((s) => s.textContent ?? '');
}

/**
 * CM6 renders each document line as its own `.cm-line` block-level `<div>`
 * with no inserted newline text node between them — `view.dom.textContent`
 * therefore never contains `\n` even for a genuinely multi-line document.
 */
function withoutNewlines(text: string): string {
  return text.replace(/\n/g, '');
}

describe('listMarkerDecoration', () => {
  describe('the marker is real, source-backed text — always, with no reveal/conceal state', () => {
    it.each([
      ['-', '- one\n- two\n- three\n\nOther'],
      ['*', '* one\n* two\n* three\n\nOther'],
      ['+', '+ one\n+ two\n+ three\n\nOther'],
    ])('"%s" marker: DOM textContent is the literal source, no character substitution', (marker, text) => {
      const view = mountView(text, text.indexOf('Other'));

      expect(markerSpans(view)).toHaveLength(3);
      expect(markerTexts(view)).toEqual([`${marker} `, `${marker} `, `${marker} `]);
      expect(view.dom.textContent).toBe(withoutNewlines(text)); // no "•" anywhere
    });

    it('the marker span contains the real "- " text, not a widget, regardless of cursor position', () => {
      const view = mountView('- Text', 0);
      expect(markerTexts(view)).toEqual(['- ']);

      view.dispatch({ selection: { anchor: 2 } }); // content-start
      expect(markerTexts(view)).toEqual(['- ']);

      view.dispatch({ selection: { anchor: 4 } }); // mid-word
      expect(markerTexts(view)).toEqual(['- ']);

      view.dispatch({ selection: { anchor: 1 } }); // inside the marker itself
      expect(markerTexts(view)).toEqual(['- ']); // still real text, still there — nothing to "reveal"
    });
  });

  describe('mixed markers in one adjacent block', () => {
    it('"- one\\n* two\\n+ three": each item\'s own marker character is preserved exactly', () => {
      const text = '- one\n* two\n+ three\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ', '* ', '+ ']);
    });
  });

  describe('nested bullets', () => {
    it('parent/child/grandchild all keep their own real marker text', () => {
      const text = '- parent\n  - child\n    - grandchild\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ', '- ', '- ']);
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('child');
      expect(view.dom.textContent).toContain('grandchild');
    });

    it('a wider indentation width (4 spaces) still nests and marks correctly', () => {
      const text = '- parent\n    - child\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  describe('list boundaries', () => {
    it('a bullet item followed by a blank line and a plain paragraph: only the item gets a marker span', () => {
      const text = '- item\n\nnormal paragraph';
      const view = mountView(text, text.indexOf('normal'));

      expect(markerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('a bullet item immediately followed by an unmarked paragraph line (no blank line) still only marks the item', () => {
      const text = '- item\nnormal paragraph\n- another item';
      const view = mountView(text, text.indexOf('normal'));

      expect(markerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  it('multiple independent lists separated by a paragraph both get marked', () => {
    const text = '- a\n- b\n\nparagraph\n\n- c\n- d';
    const view = mountView(text, text.indexOf('paragraph'));

    expect(markerTexts(view)).toEqual(['- ', '- ', '- ', '- ']);
    expect(view.dom.textContent).toBe(withoutNewlines(text));
  });

  describe('editing', () => {
    it('deleting the marker character removes the marker span for that line', () => {
      const text = '- one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      expect(markerSpans(view)).toHaveLength(1);

      view.dispatch({ changes: { from: 0, to: 1 } }); // delete the "-"

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.state.doc.toString()).toBe(' one\n\nOther');
    });

    it('typing "- " at the start of a plain line marks it once a real separator exists', () => {
      const view = mountView('one\n\nOther', 'one\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- ' } });

      expect(view.state.doc.toString()).toBe('- one\n\nOther');
      expect(markerTexts(view)).toEqual(['- ']);
    });

    it('pasting (programmatic insert) a bullet list marks it identically to typed text', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '- one\n- two' } });

      expect(markerTexts(view)).toEqual(['- ', '- ']);
    });

    it('undo restores the prior text and, with it, the prior marker rendering', () => {
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

  describe('normal editing is unaffected by this decoration', () => {
    it('typing at the beginning of the item\'s own text still inserts normally', () => {
      const view = mountView('- Text', 2);
      view.dispatch({ changes: { from: 2, insert: 'New ' } });

      expect(view.state.doc.toString()).toBe('- New Text');
    });

    it('forward Delete right after the marker still deletes into the text', () => {
      const view = mountView('- Text', 2);
      deleteCharForward(view);

      expect(view.state.doc.toString()).toBe('- ext');
    });

    it('Backspace right after the marker still runs CM6/lang-markdown\'s existing deleteMarkupBackward unchanged', () => {
      const view = mountView('- Text', 2);
      deleteMarkupBackward(view);

      expect(view.state.doc.toString()).toBe('Text');
    });

    it('a selection inside the item\'s text can still be replaced by typing', () => {
      const view = mountView('- Text', null);
      view.dispatch({ selection: { anchor: 2, head: 6 } });
      view.dispatch({ changes: { from: 2, to: 6, insert: 'Word' } });

      expect(view.state.doc.toString()).toBe('- Word');
    });

    it('Enter in an item still runs CM6/lang-markdown\'s existing list-continuation command unchanged — this decoration does not, and cannot, affect it', () => {
      // Confirms, once more and now against the shipped implementation
      // (not just a probe), that the separator-dropping behavior at
      // content-start is entirely upstream CM6, unrelated to this
      // decoration's existence.
      const view = mountView('- Text', 2);
      insertNewlineContinueMarkupCommand({ nonTightLists: false })(view);

      expect(view.state.doc.toString()).toBe('-\n- Text');
    });
  });

  describe('interaction with blockquotes', () => {
    it('"> - item": the marker renders inside the blockquote, independent of the quote marker', () => {
      const text = '> - item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('a bullet list and a blockquote alternating at the top level each render independently', () => {
      const text = '- item\n> quote\n- another item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  describe('interaction with indentation rendering (leadingIndentDecoration.ts)', () => {
    it('a nested item\'s leading indentation and its own marker both render, without conflicting or duplicating', () => {
      const text = '- parent\n  - child\n\nOther';
      const view = mountViewWithIndent(text, text.indexOf('Other'));

      expect(markerTexts(view)).toEqual(['- ', '- ']);
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

        expect(markerTexts(view)).toEqual(['-' + ' '.repeat(separatorWidth)]);
        expect(view.state.doc.toString()).toBe(text);
      }
    );

    it('does not swallow a real line break when a marker\'s next sibling is a nested list on a later line', () => {
      // "-\n  - nested": the outer marker's own nextSibling is the nested
      // BulletList, not a same-line Paragraph — the separator range must
      // stop at the outer marker's own line end. The outer marker has
      // nothing after it on its own physical line, so it correctly gets
      // no marker span at all (bare marker) — only the nested item's own
      // marker (which does have a real separator on its own line) is
      // marked.
      const text = '-\n  - nested';
      const view = mountView(text, 0);

      expect(markerSpans(view)).toHaveLength(1); // nested only
      expect(view.state.doc.toString()).toBe(text);
    });
  });

  describe('exclusions: not this slice\'s concern', () => {
    it('task-list items ("- [ ] …") are left completely unmarked', () => {
      const text = '- [ ] todo\n- [x] done';
      const view = mountView(text, text.length);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('ordered task-list items ("1. [ ] …") are left completely unmarked', () => {
      // Confirmed against the installed parser: TaskList applies to
      // ordered items exactly as it does to bullets ("1. [ ] task"
      // produces a Task/TaskMarker child identical in shape to
      // "- [ ] task") — this file's own top doc comment records that
      // investigation. Excluded here for the same reason bullet task
      // items are: checklist rendering is a separate, unimplemented slice.
      const text = '1. [ ] todo\n2. [x] done';
      const view = mountView(text, text.length);

      expect(view.dom.querySelectorAll('.cm-ordered-list-marker')).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });
  });

  describe('ordered-list markers (2026-08-29 extension)', () => {
    function orderedMarkerSpans(view: EditorView): HTMLElement[] {
      return Array.from(view.dom.querySelectorAll('.cm-ordered-list-marker'));
    }

    function orderedMarkerTexts(view: EditorView): string[] {
      return orderedMarkerSpans(view).map((s) => s.textContent ?? '');
    }

    it('"1. one\\n2. two": each item\'s own real marker+separator text is preserved, no substitution', () => {
      const text = '1. one\n2. two\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(orderedMarkerSpans(view)).toHaveLength(2);
      expect(orderedMarkerTexts(view)).toEqual(['1. ', '2. ']);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it('repeated same number ("5. A\\n5. B\\n5. C") is rendered verbatim — no renumbering', () => {
      const text = '5. A\n5. B\n5. C\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(orderedMarkerTexts(view)).toEqual(['5. ', '5. ', '5. ']);
    });

    it('paren-style markers ("1)") are marked identically to dot-style', () => {
      const text = '1) one\n2) two\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(orderedMarkerTexts(view)).toEqual(['1) ', '2) ']);
    });

    it('wider markers ("10.", "100.") are marked with their own full width, not truncated', () => {
      const text = '10. ten\n100. hundred\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(orderedMarkerTexts(view)).toEqual(['10. ', '100. ']);
    });

    it('nested ordered items each keep their own real marker text', () => {
      const text = '1. parent\n   1. child\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(orderedMarkerTexts(view)).toEqual(['1. ', '1. ']);
    });

    it('a document with 10 digits ("1234567890.") exceeds CommonMark\'s own start-number limit and is not a list at all', () => {
      const text = '1234567890. not a list';
      const view = mountView(text, text.length);

      expect(orderedMarkerSpans(view)).toHaveLength(0);
    });

    describe('mixed bullet + ordered', () => {
      it('a bullet list and an ordered list, adjacent at the top level, each render independently', () => {
        const text = '- a\n- b\n\n1. c\n2. d\n\nOther';
        const view = mountView(text, text.indexOf('Other'));

        expect(markerTexts(view)).toEqual(['- ', '- ']);
        expect(orderedMarkerTexts(view)).toEqual(['1. ', '2. ']);
      });

      it('"- 1. Text": same-line collapse across kinds renders exactly one marker (the bullet, outermost/first)', () => {
        // Confirmed against the installed parser (this file's own top doc
        // comment): "- 1. Text" is a genuinely valid, single-physical-line
        // nested parse (BulletList > OrderedList), exactly like an
        // all-bullet same-line chain. If bullet/ordered decoration used
        // two independent `seenLines` sets, this would render two markers.
        const text = '- 1. Text\n\nOther';
        const view = mountView(text, text.indexOf('Other'));

        expect(markerTexts(view)).toEqual(['- ']);
        expect(orderedMarkerSpans(view)).toHaveLength(0);
        expect(view.dom.textContent).toBe(withoutNewlines(text));
      });

      it('"1. - Text": same-line collapse across kinds renders exactly one marker (the ordered item, outermost/first)', () => {
        const text = '1. - Text\n\nOther';
        const view = mountView(text, text.indexOf('Other'));

        expect(orderedMarkerTexts(view)).toEqual(['1. ']);
        expect(markerSpans(view)).toHaveLength(0);
        expect(view.dom.textContent).toBe(withoutNewlines(text));
      });

      it('"1. - 1. Text": three-deep same-line collapse across kinds still renders exactly one (outermost) marker', () => {
        const text = '1. - 1. Text\n\nOther';
        const view = mountView(text, text.indexOf('Other'));

        expect(orderedMarkerTexts(view)).toEqual(['1. ']);
        expect(markerSpans(view)).toHaveLength(0);
      });
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
   * Locked behavior (2026-08-28, carried through the widget-to-mark
   * migration unchanged): a bare marker with nothing after it on its own
   * physical line is a syntactically valid, complete, empty `ListItem` per
   * CommonMark (`ListMark[0,1)` for `"-"` is byte-identical to `"- "`'s) —
   * not a parser bug. This construct's own marker class should not apply
   * until the marker actually has a real separator after it, so the very
   * first keystroke of typing a list item doesn't show any marker styling
   * before the marker itself is finished.
   */
  describe('bare marker (no separator, no content) is never marked', () => {
    it.each(['-', '*', '+'])('a lone "%s" at document end stays unmarked', (marker) => {
      const view = mountView(marker, 0);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(marker);
    });

    it.each(['-', '*', '+'])('"%s" followed by a blank line (nothing on its own line) stays unmarked', (marker) => {
      const text = `${marker}\n\nOther`;
      const view = mountView(text, text.indexOf('Other'));

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(withoutNewlines(text));
    });

    it.each([
      ['2 spaces', '  -'],
      ['4 spaces', '    -'],
      ['8 spaces', '        -'],
    ])('indented bare marker (%s) stays unmarked — nothing appears merely because it is nested-looking', (_label, text) => {
      const view = mountView(text, 0);

      expect(markerSpans(view)).toHaveLength(0);
      expect(view.dom.textContent).toBe(text);
    });

    it('typing "-" alone gets no marker span — only after the separator space is typed', () => {
      const view = mountView('\n\nOther', '\n\nOther'.indexOf('Other'));

      view.dispatch({ changes: { from: 0, insert: '-' } });
      expect(markerSpans(view)).toHaveLength(0);

      view.dispatch({ changes: { from: 1, insert: ' ' } });
      expect(markerTexts(view)).toEqual(['- ']);

      view.dispatch({ changes: { from: 2, insert: 'Text' } });
      expect(markerTexts(view)).toEqual(['- ']);
      expect(view.dom.textContent.startsWith('- Text')).toBe(true);
    });
  });

  describe('marker + separator (no content yet) IS marked — only a truly bare marker is excluded', () => {
    it.each(['- ', '* ', '+ '])('"%s" (marker plus separator space, empty item) gets a marker span', (text) => {
      const view = mountView(text, 0);

      expect(markerTexts(view)).toEqual([text]);
    });
  });

  describe('marker + content — unaffected by the bare-marker gate, decoration range unchanged', () => {
    it.each(['- Text', '* Text', '+ Text'])('"%s" marks the marker with its content immediately after', (text) => {
      const view = mountView(text, 0);
      const marker = text[0];

      expect(markerTexts(view)).toEqual([`${marker} `]);
    });

    it('nested list ("- Parent\\n  - Child") is unaffected — both markers have real separators', () => {
      const text = '- Parent\n  - Child';
      const view = mountView(text, text.length);

      expect(markerTexts(view)).toEqual(['- ', '- ']);
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers are added/removed by editing', () => {
      const text = '- one\n- two';
      const view = mountView(text, text.length);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 2 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside the marker range is not atomic', () => {
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
    // with a Decoration.replace widget, a selection resolving exactly at
    // content-start (marker.to, the position immediately before the item's
    // own text) was misidentified by liveMarkSelectionSnap.ts as "inside
    // the replaced range" and redirected backward. With a real,
    // source-backed marker there is no replaced range for any such
    // mechanism to exist for — a selection set directly to content-start
    // simply stays there.

    it('a selection set exactly at content-start (marker.to) stays there', () => {
      const view = mountView('- Bullet 3', null);

      view.dispatch({ selection: { anchor: 2 } });

      expect(view.state.selection.main.head).toBe(2);
      expect(markerTexts(view)).toEqual(['- ']);
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
