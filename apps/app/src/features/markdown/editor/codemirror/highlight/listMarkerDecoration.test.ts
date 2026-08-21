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

    const bullet = view.dom.querySelector('.cm-list-marker');
    expect(bullet).not.toBeNull();
    expect(bullet?.textContent).toBe('•');
    expect(view.dom.textContent).toContain('item one');
    expect(view.dom.textContent).not.toContain('-');
  });

  it('at rest, * and + markers also render as the same bullet widget', () => {
    for (const marker of ['*', '+']) {
      const text = `${marker} item one\n\nOther`;
      const view = mountView(text, text.indexOf('Other'));

      const bullet = view.dom.querySelector('.cm-list-marker');
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
    expect(view.dom.querySelector('.cm-list-marker')).toBeNull(); // not the bullet widget
    expect(view.dom.textContent).toContain('1. item one');
  });

  it('reveals the raw "1. " once the cursor is inside an ordered item — no numbered widget while engaged', () => {
    const view = mountView('1. item one');

    view.dispatch({ selection: { anchor: 5 } }); // inside "item"

    expect(view.dom.textContent).toBe('1. item one');
    expect(view.dom.querySelector('.cm-list-number')).toBeNull();
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

    const bullets = Array.from(view.dom.querySelectorAll('.cm-list-marker')).map((el) => el.textContent);
    const numbers = Array.from(view.dom.querySelectorAll('.cm-list-number')).map((el) => el.textContent);
    expect(bullets).toEqual(['•', '•']);
    expect(numbers).toEqual(['1.']);
  });

  it("a Task-owned ListMark — ordered or bullet — never gets the numbered/bullet widget, leaving the checkbox as the item's sole rendered representation", () => {
    const text = '1. [ ] ordered task\n- [ ] bullet task\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-list-number')).toHaveLength(0);
    expect(view.dom.querySelectorAll('.cm-list-marker')).toHaveLength(0);
  });

  it('reveals the raw "- " once the cursor is inside the item — no bullet widget while engaged', () => {
    const view = mountView('- item one');

    view.dispatch({ selection: { anchor: 4 } }); // inside "item"

    expect(view.dom.textContent).toBe('- item one');
    expect(view.dom.querySelector('.cm-list-marker')).toBeNull();
  });

  it('re-collapses to the bullet widget once the selection leaves the item', () => {
    const text = '- item one\n\nOther';
    const view = mountView(text, 4); // inside the list item

    expect(view.dom.textContent).toContain('- item one');
    expect(view.dom.querySelector('.cm-list-marker')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Other') } });

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).toContain('item one');
    expect(view.dom.querySelector('.cm-list-marker')?.textContent).toBe('•');
  });

  it("nested lists: only the engaged item's own marker reveals, both levels render as bullets at rest", () => {
    const text = '- item one\n  - nested item\n\nOther';
    const nestedStart = text.indexOf('nested');
    const atRest = mountView(text, text.indexOf('Other'));

    // At rest: neither raw marker is visible, both render as bullets, and
    // the nested item's leading indentation (untouched raw text, not a
    // node) is still present.
    expect(atRest.dom.textContent).not.toContain('-');
    expect(atRest.dom.querySelectorAll('.cm-list-marker')).toHaveLength(2);
    expect(atRest.dom.textContent).toContain('nested item');

    // Physical-line engagement: engaging the nested item reveals only its
    // own marker. The parent ListItem's node range technically extends
    // across the nested sublist's lines too (confirmed by the node-shape
    // probe), but engagement is now scoped to the marker's own physical
    // line, not the enclosing node's full span — so the parent's marker
    // correctly stays a collapsed bullet while a sibling/descendant line
    // is engaged.
    const engaged = mountView(text, nestedStart + 2); // inside "nested"

    expect(engaged.dom.textContent).toContain('- nested item');
    expect(engaged.dom.textContent).not.toContain('- item one');
    expect(engaged.dom.querySelectorAll('.cm-list-marker')).toHaveLength(1); // only the parent's
  });

  it("each item's marker engages independently — engaging one does not reveal a sibling's", () => {
    const text = '- first\n- second';
    const secondStart = text.indexOf('second');
    const view = mountView(text, secondStart + 2); // inside "second"

    expect(view.dom.textContent).toContain('- second');
    expect(view.dom.textContent).not.toContain('- first');
    expect(view.dom.textContent).toContain('first');
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

    it("the marker's own physical line still reveals correctly despite the lazy-continuation fix", () => {
      const text = '- item\n=';
      const view = mountView(text, 2); // inside "item", the marker's own line

      expect(view.dom.textContent).toContain('- item');
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
