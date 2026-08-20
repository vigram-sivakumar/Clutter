// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
});
