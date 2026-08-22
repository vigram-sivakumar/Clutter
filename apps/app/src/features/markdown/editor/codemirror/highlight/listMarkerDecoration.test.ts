// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { listMarkerDecoration } from './listMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/**
 * Mirrors headingMarkerDecoration.test.ts's `mountView`: `initialAnchor`
 * defaults to document start (position 0), which for a list item starting
 * at position 0 is also the `ListItem` node's own start boundary — counted
 * as engaged per the shared boundary-inclusive containment rule
 * (`isTokenEngaged`). Genuinely at-rest tests place the initial cursor
 * outside the node explicitly.
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
  it('at rest, an unordered list marker (- ) renders as a bullet widget, not the raw text', () => {
    const text = '- item one\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const bullet = view.dom.querySelector('.cm-bullet-list-marker');
    expect(bullet).not.toBeNull();
    expect(bullet?.textContent).toBe('•');
    expect(view.dom.textContent).toContain('item one');
    expect(view.dom.textContent).not.toContain('-');
  });

  it('at rest, * and + markers also render as the same bullet widget', () => {
    for (const marker of ['*', '+']) {
      const text = `${marker} item one\n\nOther`;
      const view = mountView(text, text.indexOf('Other'));

      const bullet = view.dom.querySelector('.cm-bullet-list-marker');
      expect(bullet?.textContent).toBe('•');
      expect(view.dom.textContent).toContain('item one');
      expect(view.dom.textContent).not.toContain(marker);
    }
  });

  it('at rest, an ordered list marker (1. ) renders as a numbered widget, not the raw text disappearing', () => {
    const text = '1. item one\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const number = view.dom.querySelector('.cm-list-number');
    expect(number).not.toBeNull();
    expect(number?.textContent).toBe('1.');
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull(); // not the bullet widget
    expect(view.dom.textContent).toContain('1. item one');
  });

  it('stays rendered as the numbered widget even once the cursor is inside the ordered item', () => {
    const view = mountView('1. item one');
    const widgetBefore = view.dom.querySelector('.cm-list-number');
    expect(widgetBefore?.textContent).toBe('1.');

    view.dispatch({ selection: { anchor: 5 } }); // inside "item"

    // Still a real widget node, not raw text mimicking the same string —
    // the DOM element itself is still present, same as before dispatch.
    expect(view.dom.querySelector('.cm-list-number')?.textContent).toBe('1.');
    expect(view.dom.querySelector('.cm-list-number')).not.toBeNull();
  });

  it("an ordered list's second and third items render their own actual numbers, not a repeated 1.", () => {
    const text = '1. first\n2. second\n3. third\n\nOther';
    const view = mountView(text, text.indexOf('Other')); // outside every item, nothing engaged

    const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
    expect(numbers).toEqual(['1.', '2.', '3.']);
  });

  it('nested ordered lists: both levels render their own numbers at rest, independently', () => {
    const text = '1. parent\n   1. nested\n   2. nested two\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
    expect(numbers).toEqual(['1.', '1.', '2.']);
    expect(view.dom.textContent).toContain('nested two');
  });

  it('mixed ordered and unordered lists render each marker with its own widget kind, independently', () => {
    const text = '- bullet one\n1. ordered one\n- bullet two\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const bullets = Array.from(view.dom.querySelectorAll('.cm-bullet-list-marker')).map((el) => el.textContent);
    const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
    expect(bullets).toEqual(['•', '•']);
    expect(numbers).toEqual(['1.']);
  });

  it("a Task-owned ListMark — ordered or bullet — never gets the numbered/bullet widget, leaving the checkbox as the item's sole rendered representation", () => {
    const text = '1. [ ] ordered task\n- [ ] bullet task\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-list-number')).toHaveLength(0);
    expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(0);
  });

  it('stays rendered as the bullet widget even once the cursor is inside the item', () => {
    const view = mountView('- item one');

    view.dispatch({ selection: { anchor: 4 } }); // inside "item"

    expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('•');
    expect(view.dom.textContent).not.toContain('- item one');
  });

  it('stays the bullet widget whether the selection is inside the item or elsewhere in the document', () => {
    const text = '- item one\n\nOther';
    const view = mountView(text, 4); // inside the list item

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).toContain('item one');
    expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('•');

    view.dispatch({ selection: { anchor: text.indexOf('Other') } });

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).toContain('item one');
    expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('•');
  });

  it('nested lists: both levels stay rendered as bullets regardless of where the cursor is', () => {
    const text = '- item one\n  - nested item\n\nOther';
    const nestedStart = text.indexOf('nested');
    const atRest = mountView(text, text.indexOf('Other'));

    expect(atRest.dom.textContent).not.toContain('-');
    expect(atRest.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(2);
    expect(atRest.dom.textContent).toContain('nested item');

    // Cursor inside the nested item's own text — still both bullets, no
    // raw "-" revealed for either level.
    const cursorOnNested = mountView(text, nestedStart + 2); // inside "nested"

    expect(cursorOnNested.dom.textContent).not.toContain('-');
    expect(cursorOnNested.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(2);
  });

  it("each item's marker stays rendered independently of where the cursor is on a sibling", () => {
    const text = '- first\n- second';
    const secondStart = text.indexOf('second');
    const view = mountView(text, secondStart + 2); // inside "second"

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(2);
    expect(view.dom.textContent).toContain('first');
    expect(view.dom.textContent).toContain('second');
  });

  describe('lazy continuation does not leak engagement onto an unrelated marker-less line', () => {
    it('"- item\\n=": cursor on the "=" line does not reveal "-" — the "=" line has no ListMark of its own', () => {
      const text = '- item\n=';
      const view = mountView(text, text.indexOf('='));

      expect(view.dom.textContent).not.toContain('-');
      expect(view.dom.textContent).toContain('item');
    });

    it('nested list + lazy continuation: a "=" line after a nested item leaves both levels collapsed', () => {
      const text = '- parent\n  - nested\n=';
      const view = mountView(text, text.indexOf('='));

      expect(view.dom.textContent).not.toContain('-');
      expect(view.dom.textContent).toContain('parent');
      expect(view.dom.textContent).toContain('nested');
    });

    it("the marker's own physical line stays rendered as a bullet regardless of the lazy-continuation fix", () => {
      const text = '- item\n=';
      const view = mountView(text, 2); // inside "item", the marker's own line

      expect(view.dom.textContent).not.toContain('-');
      expect(view.dom.querySelector('.cm-bullet-list-marker')?.textContent).toBe('•');
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

  describe('falls back to plain text only when the syntax itself breaks, never from cursor placement', () => {
    it('deleting the "." from "1." stops it from parsing as a list marker at all', () => {
      const text = '1. item';
      const view = mountView(text, text.length);
      expect(view.dom.querySelector('.cm-list-number')).not.toBeNull();

      const dotPos = text.indexOf('.');
      view.dispatch({ changes: { from: dotPos, to: dotPos + 1, insert: '' } });

      expect(view.dom.querySelector('.cm-list-number')).toBeNull();
      expect(view.dom.textContent).toBe('1 item');
    });

    it('deleting the required separator space so "1.Text" is no longer a valid marker falls back to plain text', () => {
      const text = '1. Text';
      const view = mountView(text, text.length);
      expect(view.dom.querySelector('.cm-list-number')).not.toBeNull();

      const spacePos = text.indexOf(' ');
      view.dispatch({ changes: { from: spacePos, to: spacePos + 1, insert: '' } });

      expect(view.dom.querySelector('.cm-list-number')).toBeNull();
      expect(view.dom.textContent).toBe('1.Text');
    });

    it('deleting the "-" itself removes the bullet entirely — nothing left to render', () => {
      const text = '- item';
      const view = mountView(text, text.length);
      expect(view.dom.querySelector('.cm-bullet-list-marker')).not.toBeNull();

      view.dispatch({ changes: { from: 0, to: 2, insert: '' } });

      expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
      expect(view.dom.textContent).toBe('item');
    });
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = '- item one';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 4 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('does not affect plain text with no list', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
