// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisMarkerDecoration } from './emphasisMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';
import { strikethroughMarkerDecoration } from './strikethroughMarkerDecoration';

/** Mirrors emphasisMarkerDecoration.test.ts's style: mount a real EditorView in jsdom and inspect rendered DOM/state. */
function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      markdownHighlighting(),
      strikethroughMarkerDecoration(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

describe('strikethroughMarkerDecoration', () => {
  it('at rest, the ~~ markers have no DOM presence at all — not merely hidden', () => {
    const view = mountView('Text before ~~struck~~ after');

    expect(view.dom.textContent).toContain('Text before struck after');
    expect(view.dom.textContent).not.toContain('~');
  });

  it('reveals the raw ~~…~~ text once the cursor is inside it', () => {
    const text = 'Text before ~~struck~~ after';
    const view = mountView(text);
    const nodeStart = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeStart + 3 } });

    expect(view.dom.textContent).toContain('~~struck~~');
  });

  it('re-collapses the markers once the selection leaves the node', () => {
    const view = mountView('Before ~~struck~~ after');

    view.dispatch({ selection: { anchor: 10 } }); // inside the node
    expect(view.dom.textContent).toContain('~~struck~~');

    view.dispatch({ selection: { anchor: 0 } }); // outside the node
    expect(view.dom.textContent).not.toContain('~');
    expect(view.dom.textContent).toContain('struck');
  });

  it('~~**bold**~~: engaging the inner text reveals both delimiter pairs (strikethrough and emphasis independently)', () => {
    const text = 'Text before ~~**bold**~~ after';
    const view = mountView(text, [emphasisMarkerDecoration()]);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('~');
    expect(view.dom.textContent).not.toContain('*');

    view.dispatch({ selection: { anchor: nodeStart + 6 } }); // inside "bold"
    expect(view.dom.textContent).toContain('~~**bold**~~');
  });

  it('**~~strike~~**: same composition with emphasis on the outside', () => {
    const text = 'Text before **~~strike~~** after';
    const view = mountView(text, [emphasisMarkerDecoration()]);
    const nodeStart = 'Text before '.length;

    expect(view.dom.textContent).not.toContain('~');
    expect(view.dom.textContent).not.toContain('*');

    view.dispatch({ selection: { anchor: nodeStart + 6 } }); // inside "strike"
    expect(view.dom.textContent).toContain('**~~strike~~**');
  });

  describe('node shape', () => {
    it('Strikethrough has exactly two StrikethroughMark children — firstChild and lastChild', () => {
      const language = markdownLanguageExtension().language;
      const tree = language.parser.parse('~~struck~~');
      const cursor = tree.cursor();
      let found = false;

      function visit() {
        if (cursor.name === 'Strikethrough') {
          found = true;
          const node = cursor.node;
          expect(node.firstChild?.name).toBe('StrikethroughMark');
          expect(node.lastChild?.name).toBe('StrikethroughMark');
          expect(node.firstChild).not.toBe(node.lastChild);
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
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as markers collapse/reveal', () => {
      const text = 'Text before ~~struck~~ after';
      const view = mountView(text);
      const nodeStart = 'Text before '.length;

      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: nodeStart + 3 } }); // engage
      expect(view.state.doc.toString()).toBe(text);

      view.dispatch({ selection: { anchor: 0 } }); // disengage
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic — it lands exactly there, unmoved', () => {
      // 'Text before ' = 12 chars, opening '~~' occupies [12, 14).
      const text = 'Text before ~~struck~~ after';
      const view = mountView(text);

      view.dispatch({ selection: { anchor: 13 } });

      expect(view.state.selection.main.head).toBe(13);
      expect(view.state.selection.main.anchor).toBe(13);
    });

    it('does not affect plain text with no strikethrough', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
