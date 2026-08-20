// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { headingMarkerDecoration } from './headingMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';
import { setextHeadingTypographyDecoration } from './setextHeadingTypographyDecoration';

/**
 * Covers the actual reported bug: typing `=`/`-` under an existing
 * paragraph retroactively applies heading typography (`tok-heading1`/
 * `tok-heading2`) to that *previous* line, purely because
 * `markdownHighlightStyle.ts`'s static `syntaxHighlighting()` has no
 * engagement-awareness. `headingMarkerDecoration.test.ts` already covers
 * marker *hiding* (a separate, previously-fixed gap); these tests cover
 * typography specifically, and the narrower "only while the caret is on
 * the underline row, not the text line" scoping documented in
 * `setextHeadingTypographyDecoration.ts`.
 */
function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdownLanguageExtension(),
      markdownHighlighting(),
      headingMarkerDecoration(),
      setextHeadingTypographyDecoration(),
    ],
  });
  return new EditorView({ state, parent });
}

function headingSpanClass(view: EditorView, text: string): string {
  const span = [...view.dom.querySelectorAll('span')].find((s) => s.textContent?.includes(text));
  return span?.className ?? '';
}

/** Reads the actual parsed SetextHeading node's own `.to` and its `HeaderMark` child's `.from` from a state — never assumed/hardcoded, per the design's "verify against actual CodeMirror selection semantics" requirement. */
function findSetextBounds(state: EditorState): { nodeTo: number; underlineFrom: number } {
  let result: { nodeTo: number; underlineFrom: number } | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'SetextHeading1' && node.name !== 'SetextHeading2') {
        return;
      }
      const underline = node.node.lastChild;
      if (underline && underline.name === 'HeaderMark') {
        result = { nodeTo: node.to, underlineFrom: underline.from };
      }
    },
  });
  if (!result) {
    throw new Error('no SetextHeading node found');
  }
  return result;
}

describe('setextHeadingTypographyDecoration', () => {
  it('suppresses heading typography on the previous line while a bare "=" underline candidate is being typed', () => {
    const doc = 'Hey I am here\n=';
    const view = mountView(doc, doc.length); // caret right after the "="

    expect(view.dom.textContent).not.toMatch(/tok-heading/);
    // The text itself must still be present, unstyled.
    expect(view.dom.textContent).toContain('Hey I am here');
    const span = [...view.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Hey I am here')
    );
    expect(span?.className ?? '').not.toContain('tok-heading1');
  });

  it('suppresses typography for a "-" (Setext H2) underline candidate the same way', () => {
    const doc = 'Hey I am here\n-';
    const view = mountView(doc, doc.length);

    const span = [...view.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Hey I am here')
    );
    expect(span?.className ?? '').not.toContain('tok-heading2');
  });

  it('applies heading typography once the caret leaves the underline row entirely', () => {
    const doc = 'Hey I am here\n=\n\nOther';
    const view = mountView(doc, doc.indexOf('Other'));

    const span = [...view.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Hey I am here')
    );
    expect(span?.className ?? '').toContain('tok-heading1');
  });

  it('keeps heading typography while editing the heading TEXT line itself (parity with ATX)', () => {
    const doc = 'Hey I am here\n=';
    const view = mountView(doc, 3); // caret inside "Hey I am here"

    const span = [...view.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Hey I am here')
    );
    expect(span?.className ?? '').toContain('tok-heading1');
  });

  it('reverts to plain paragraph typography once a non-underline character breaks the Setext candidate', () => {
    const doc = 'Hey I am here\n==Trying to create a highlighted text';
    const view = mountView(doc, doc.length);

    expect(view.dom.textContent).not.toMatch(/tok-heading/);
    const span = [...view.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Hey I am here')
    );
    expect(span).toBeUndefined(); // merged into one plain, unstyled paragraph line — no span at all
  });

  it('does not affect ATX headings regardless of caret position', () => {
    const doc = '# Heading\n\nOther';
    const restView = mountView(doc, doc.indexOf('Other'));
    expect(restView.dom.textContent).not.toContain('tok-setext-pending');

    const engagedView = mountView(doc, 5); // inside "Heading"
    const span = [...engagedView.dom.querySelectorAll('span')].find((s) =>
      s.textContent?.includes('Heading')
    );
    expect(span?.className ?? '').toContain('tok-heading1');
    expect(engagedView.dom.textContent).not.toContain('tok-setext-pending');
  });

  it('does not throw and produces no decorations on a document with no heading at all', () => {
    const view = mountView('Just plain text, nothing to hide.', 5);
    expect(view.dom.textContent).toBe('Just plain text, nothing to hide.');
  });

  it('the stored document text never changes as typography is suppressed/restored', () => {
    const doc = 'Hey I am here\n=';
    const view = mountView(doc, doc.length);

    expect(view.state.doc.toString()).toBe(doc);
    view.dispatch({ selection: { anchor: 3 } });
    expect(view.state.doc.toString()).toBe(doc);
  });

  describe('trailing whitespace on the underline (the gap the previous engagement range missed)', () => {
    it('"= " (single "=" plus a trailing space): caret after the space still suppresses', () => {
      const doc = 'Hello world\n= ';
      const view = mountView(doc, doc.length); // caret right after the trailing space

      expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');
    });

    it('"==  " (double "=" plus two trailing spaces): caret after the spaces still suppresses', () => {
      const doc = 'Hello world\n==  ';
      const view = mountView(doc, doc.length);

      expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');
    });

    it('"-  " (Setext H2, dash plus trailing spaces): caret after the spaces still suppresses', () => {
      const doc = 'Hello world\n-  ';
      const view = mountView(doc, doc.length);

      expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading2');
    });
  });

  describe('boundary behavior around the outer node.to, verified against the actual parsed tree', () => {
    it('caret exactly at node.to (the true end of the underline row) still suppresses', () => {
      const doc = 'Hello world\n==  ';
      const probe = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
      const { nodeTo } = findSetextBounds(probe);
      expect(nodeTo).toBe(doc.length); // sanity: doc-final underline, node.to reaches doc end

      const view = mountView(doc, nodeTo);
      expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');
    });

    it('caret on a genuinely following line (past node.to) does not suppress', () => {
      const doc = 'Hello world\n==  \nAfter';
      const probe = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
      const { nodeTo } = findSetextBounds(probe);
      // The following line starts strictly after node.to (a real line break sits between).
      const followingLineStart = doc.indexOf('After');
      expect(followingLineStart).toBeGreaterThan(nodeTo);

      const view = mountView(doc, followingLineStart);
      expect(headingSpanClass(view, 'Hello world')).toContain('tok-heading1');
    });
  });

  it('backspacing within the underline (=== -> ==  -> =) keeps suppression active throughout', () => {
    const view = mountView('Hello world\n===', 'Hello world\n==='.length);
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');

    view.dispatch({ changes: { from: view.state.doc.length - 1, to: view.state.doc.length } }); // -> "=="
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.state.doc.toString()).toBe('Hello world\n==');
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');

    view.dispatch({ changes: { from: view.state.doc.length - 1, to: view.state.doc.length } }); // -> "="
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(view.state.doc.toString()).toBe('Hello world\n=');
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');
  });

  it('switching "=" to "-" mid-edit keeps suppression active throughout', () => {
    const view = mountView('Hello world\n=', 'Hello world\n='.length);
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');

    const lastPos = view.state.doc.length;
    view.dispatch({
      changes: { from: lastPos - 1, to: lastPos, insert: '-' },
      selection: { anchor: lastPos },
    });
    expect(view.state.doc.toString()).toBe('Hello world\n-');
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading1');
    expect(headingSpanClass(view, 'Hello world')).not.toContain('tok-heading2');
  });
});
