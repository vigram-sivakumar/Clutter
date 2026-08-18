// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { headingMarkerDecoration } from './headingMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/**
 * Mirrors emphasisMarkerDecoration.test.ts. Node-granularity engagement
 * replaces the previous line-granularity `.cm-activeLine` behavior
 * (headingSeparatorDecoration.ts, now removed) — these tests cover the
 * new mechanism, since no equivalent test existed for the old one.
 */
/**
 * `initialAnchor` defaults to `null` (document start, position 0) — but
 * for a heading, position 0 is *also* the heading node's own start
 * boundary, which counts as engaged per the shared containment rule
 * (`isTokenEngaged`: a boundary-touching caret counts). Tests that want a
 * genuinely at-rest heading must place the initial cursor somewhere
 * outside the node explicitly, exactly as a real editor would after
 * `createEditorView.ts`'s own default (`selection: { anchor: doc.length }`).
 */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), markdownHighlighting(), headingMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('headingMarkerDecoration', () => {
  it('at rest, the "# " prefix (hash run + separator space) has no DOM presence at all', () => {
    // Initial cursor placed on a later line, genuinely outside the
    // heading node's range — the node's own end boundary would still
    // count as engaged (boundary-inclusive containment), same as its
    // start.
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).toContain('Heading');
    expect(view.dom.textContent).not.toContain('#');
  });

  it('reveals the raw "# " prefix once the cursor is inside the heading', () => {
    const view = mountView('# Heading');

    view.dispatch({ selection: { anchor: 5 } }); // inside "Heading"

    expect(view.dom.textContent).toBe('# Heading');
  });

  it('re-collapses the prefix once the selection leaves the heading', () => {
    const view = mountView('# Heading\n\nOther text');

    view.dispatch({ selection: { anchor: 5 } }); // inside the heading
    expect(view.dom.textContent).toContain('# Heading');

    view.dispatch({ selection: { anchor: view.state.doc.length } }); // outside
    expect(view.dom.textContent).not.toContain('#');
    expect(view.dom.textContent).toContain('Heading');
  });

  it('## H2 collapses and reveals its two-hash prefix the same way', () => {
    const text = '## Subheading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('#');

    view.dispatch({ selection: { anchor: 6 } });
    expect(view.dom.textContent).toContain('## Subheading');
  });

  it('a bare "#" with no title (no separator to hide) does not throw and collapses just the hash', () => {
    const text = '#\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('#');

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.textContent).toContain('#');
  });

  it('is scoped to per-line-independent engagement, not the whole document', () => {
    const view = mountView('# One\n\n# Two');
    const twoStart = '# One\n\n'.length;

    view.dispatch({ selection: { anchor: twoStart + 3 } }); // inside "# Two" only

    // "# One" stays collapsed; "# Two" reveals.
    expect(view.dom.textContent).toContain('One');
    expect(view.dom.textContent).toContain('# Two');
    expect(view.dom.textContent).not.toMatch(/#\s*One/);
  });

  describe('core invariant: the document is always authoritative', () => {
    it('the stored document text never changes as the prefix collapses/reveals', () => {
      const text = '# Heading';
      const view = mountView(text);

      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 5 } });
      expect(view.state.doc.toString()).toBe(text);
      view.dispatch({ selection: { anchor: 0 } });
      expect(view.state.doc.toString()).toBe(text);
    });

    it('a selection placed at a document offset inside an at-rest collapsed range is not atomic', () => {
      // '# ' occupies [0, 2) — no EditorView.atomicRanges registered for
      // this decoration (same reasoning as emphasisMarkerDecoration).
      const view = mountView('# Heading');

      view.dispatch({ selection: { anchor: 1 } });

      expect(view.state.selection.main.head).toBe(1);
    });

    it('does not affect plain text with no heading', () => {
      const view = mountView('Just plain text, nothing to hide.');

      expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
    });
  });
});
