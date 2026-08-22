// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { listMarkerDecoration } from './listMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/**
 * `initialAnchor` defaults to document start (position 0), which for a
 * list item starting at position 0 is also the marker's own range
 * boundary — counted as inside per the shared boundary-inclusive
 * containment rule. Genuinely at-rest tests place the initial cursor
 * outside the marker range explicitly (a leading "Other" line, or an
 * explicit position past it).
 */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), markdownHighlighting(), listMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('listMarkerDecoration', () => {
  describe('at rest: real marker text, styled, not normalized', () => {
    it('a bullet marker renders its own real character, styled — not normalized to a dot', () => {
      const text = '- item one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const bullet = view.dom.querySelector('.cm-bullet-list-marker');
      expect(bullet).not.toBeNull();
      expect(bullet?.textContent).toBe('-');
      expect(view.dom.textContent).toContain('- item one');
    });

    it('* and + render as themselves too, each still real text', () => {
      for (const marker of ['*', '+']) {
        const text = `${marker} item one\n\nOther`;
        const view = mountView(text, text.indexOf('Other'));

        const bullet = view.dom.querySelector('.cm-bullet-list-marker');
        expect(bullet?.textContent).toBe(marker);
      }
    });

    it('an ordered marker renders its own real text', () => {
      const text = '1. item one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const number = view.dom.querySelector('.cm-list-number');
      expect(number).not.toBeNull();
      expect(number?.textContent).toBe('1.');
      expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
      expect(view.dom.textContent).toContain('1. item one');
    });

    it("an ordered list's second and third items render their own actual numbers", () => {
      const text = '1. first\n2. second\n3. third\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
      expect(numbers).toEqual(['1.', '2.', '3.']);
    });

    it('multi-digit ordered markers (10., 100.) render their real full text, unconditionally, same as single-digit ones', () => {
      const text = '10. tenth\n100. hundredth\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
      expect(numbers).toEqual(['10.', '100.']);

      // Same invariant as single-digit markers: caret inside a multi-digit
      // marker must not change its DOM node, class, or text either.
      const before = view.dom.querySelectorAll('.cm-list-number')[1];
      view.dispatch({ selection: { anchor: text.indexOf('100.') + 1 } });
      const after = view.dom.querySelectorAll('.cm-list-number')[1];
      expect(after).toBe(before);
      expect(after?.textContent).toBe('100.');
    });

    it('nested ordered lists: both levels render their own numbers at rest, independently', () => {
      const text = '1. parent\n   1. nested\n   2. nested two\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
      expect(numbers).toEqual(['1.', '1.', '2.']);
    });

    it('mixed ordered and unordered lists render each marker with its own class, independently', () => {
      const text = '- bullet one\n1. ordered one\n- bullet two\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const bullets = Array.from(view.dom.querySelectorAll('.cm-bullet-list-marker')).map((el) => el.textContent);
      const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
      expect(bullets).toEqual(['-', '-']);
      expect(numbers).toEqual(['1.']);
    });

    it('a task item renders only the checkbox — never a bullet/number widget too', () => {
      const text = '1. [ ] ordered task\n- [ ] bullet task\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      expect(view.dom.querySelectorAll('.cm-list-number')).toHaveLength(0);
      expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(0);
      expect(view.dom.querySelectorAll('button[role="checkbox"]')).toHaveLength(2);
    });

    it('an unchecked and checked task each render the correct checkbox state', () => {
      const text = '- [ ] unchecked\n- [X] checked\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
      expect(Array.from(checkboxes).map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    });
  });

  describe('core invariant: cursor position never changes marker rendering (parser-driven, not selection-driven)', () => {
    it('caret entering "1." leaves the exact same DOM node, class, and text — no widget swap, no removal', () => {
      const text = '1. item one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      const before = view.dom.querySelector('.cm-list-number');
      expect(before?.textContent).toBe('1.');

      view.dispatch({ selection: { anchor: 1 } }); // inside "1."

      const after = view.dom.querySelector('.cm-list-number');
      expect(after).not.toBeNull();
      expect(after).toBe(before); // same DOM node, not a re-created one
      expect(after?.textContent).toBe('1.');
    });

    it('caret entering "-" leaves the exact same DOM node, class, and text', () => {
      const text = '- item one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      const before = view.dom.querySelector('.cm-bullet-list-marker');
      expect(before?.textContent).toBe('-');

      view.dispatch({ selection: { anchor: 0 } }); // on the "-" itself

      const after = view.dom.querySelector('.cm-bullet-list-marker');
      expect(after).toBe(before);
      expect(after?.textContent).toBe('-');
    });

    it('caret in the item TEXT does not affect the marker either', () => {
      const text = '- item one\n\nOther';
      const view = mountView(text, text.indexOf('item'));

      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('-');
    });

    it('nested lists: both markers stay rendered identically regardless of which line the caret is on', () => {
      const text = '- item one\n  - nested item\n\nOther';
      const nestedMarkerPos = text.indexOf('- nested') + 1;
      const view = mountView(text, nestedMarkerPos);

      const markers = view.dom.querySelectorAll('.cm-bullet-list-marker');
      expect(markers).toHaveLength(2);
      expect(Array.from(markers).map((m) => m.textContent)).toEqual(['-', '-']);
    });

    it("each item's marker stays rendered independently of where the caret is on a sibling", () => {
      const text = '- first\n- second';
      const secondMarkerPos = text.indexOf('- second');
      const view = mountView(text, secondMarkerPos);

      expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(2);
    });

    it('the underlying marker text remains real, editable DOM text (not contenteditable=false) — a Decoration.mark, not a widget', () => {
      const text = '1. item one\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      const marker = view.dom.querySelector('.cm-list-number');
      expect(marker?.getAttribute('contenteditable')).not.toBe('false');
    });
  });

  describe('task marker: always the checkbox widget, regardless of caret position', () => {
    it('caret inside "[ ]" leaves the checkbox rendered — no reveal of "- [ ]"', () => {
      const text = '- [ ] Buy milk\n\nOther';
      const view = mountView(text, text.indexOf('[ ]') + 1);

      expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
      expect(view.dom.textContent).not.toContain('[ ]');
    });

    it('caret on the leading "-" also leaves the checkbox rendered — no bare "-" and no reveal', () => {
      const text = '- [ ] Buy milk\n\nOther';
      const view = mountView(text, 0); // on the dash itself

      expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
      expect(view.dom.textContent).not.toContain('- [ ]');
    });

    it('caret in the task TEXT also leaves the checkbox rendered — no raw "-" or "[ ]" ever', () => {
      const text = '- [ ] Buy milk';
      const view = mountView(text, text.indexOf('Buy'));

      expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
      expect(view.dom.textContent).not.toContain('[ ]');
    });

    it('moving the caret across the whole line never swaps the checkbox for a different DOM node', () => {
      const text = '- [ ] Buy milk\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      const before = view.dom.querySelector('button[role="checkbox"]');

      view.dispatch({ selection: { anchor: text.indexOf('[ ]') + 1 } });
      const inMarker = view.dom.querySelector('button[role="checkbox"]');

      view.dispatch({ selection: { anchor: text.indexOf('Buy') } });
      const inText = view.dom.querySelector('button[role="checkbox"]');

      expect(before).toBe(inMarker);
      expect(inMarker).toBe(inText);
    });
  });

  describe('lazy continuation does not leak the reveal onto an unrelated marker-less line', () => {
    it('"- item\\n=": cursor on the "=" line does not reveal "-"', () => {
      const text = '- item\n=';
      const view = mountView(text, text.indexOf('='));

      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('-');
    });

    it('nested list + lazy continuation: a "=" line after a nested item leaves both levels rendered', () => {
      const text = '- parent\n  - nested\n=';
      const view = mountView(text, text.indexOf('='));

      expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(2);
    });
  });

  describe('editing the marker updates the rendering naturally', () => {
    it('1. -> 2.: still renders as an ordered marker with the new number', () => {
      const text = '1. item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      view.dispatch({ changes: { from: 0, to: 1, insert: '2' } });

      expect(view.dom.querySelector('.cm-list-number')?.textContent).toBe('2.');
    });

    it('deleting "." from "1." breaks the marker — falls back to plain text', () => {
      const text = '1. item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      expect(view.dom.querySelector('.cm-list-number')).not.toBeNull();

      view.dispatch({ changes: { from: 1, to: 2, insert: '' } });

      expect(view.dom.querySelector('.cm-list-number')).toBeNull();
      expect(view.dom.textContent).toContain('1 item');
    });

    it('1. -> -: becomes a bullet marker and gets bullet styling', () => {
      const text = '1. item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      view.dispatch({ changes: { from: 0, to: 2, insert: '-' } });

      expect(view.dom.querySelector('.cm-list-number')).toBeNull();
      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('-');
    });

    it('- -> * -> +: stays a bullet marker throughout, updating its own character', () => {
      const text = '- item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      view.dispatch({ changes: { from: 0, to: 1, insert: '*' } });
      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('*');

      view.dispatch({ changes: { from: 0, to: 1, insert: '+' } });
      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('+');
    });

    it('breaking task syntax (deleting "]") falls back to normal Markdown', () => {
      const text = '- [ ] item\n\nOther';
      const view = mountView(text, text.indexOf('Other'));
      expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();

      const closeBracket = text.indexOf(']');
      view.dispatch({ changes: { from: closeBracket, to: closeBracket + 1, insert: '' } });

      expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
    });
  });

  describe('node shape', () => {
    it('ListItem\'s firstChild is ListMark for bullet and ordered markers alike', () => {
      const language = markdownLanguageExtension().language;

      for (const text of ['- item', '* item', '+ item', '1. item']) {
        const tree = language.parser.parse(text);
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
      }
    });
  });

  describe('core invariant: cursor movement never mutates the document', () => {
    it('the stored document text never changes as markers render/reveal', () => {
      const text = '- item one';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 0 } }); // into the marker
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 4 } }); // out of it
      expect(view.state.doc.toString()).toBe(text);
    });

    it('does not affect plain text with no list', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
