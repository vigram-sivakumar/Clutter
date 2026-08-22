// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { blockquoteMarkerDecoration } from '../highlight/blockquoteMarkerDecoration';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listIndentWhitespaceDecoration } from './listIndentWhitespaceDecoration';

function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), blockquoteMarkerDecoration(), listIndentWhitespaceDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('listIndentWhitespaceDecoration', () => {
  it('at rest, collapses the raw leading whitespace before a nested bullet marker', () => {
    const text = '- parent\n  - nested\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    // The 2 leading spaces before the nested "-" are gone from the
    // rendered text; the document itself is untouched.
    expect(view.dom.textContent).not.toContain('  -');
    expect(view.state.doc.toString()).toBe(text);
  });

  it('at rest, collapses leading whitespace before a nested ordered marker', () => {
    const text = '1. Item\n   2. sdv\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('   2.');
    expect(view.state.doc.toString()).toBe(text);
  });

  it('at rest, collapses leading whitespace before a nested emoji marker', () => {
    const text = '🔥 top\n   🔥 nested\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('   🔥 nested');
    expect(view.state.doc.toString()).toBe(text);
  });

  it('reveals the raw leading whitespace once the physical line is engaged', () => {
    const text = '1. Item\n   2. sdv';
    // Default selection (position 0) sits on the "1. Item" line, so the
    // nested line's own whitespace starts out collapsed.
    const view = mountView(text);
    expect(view.dom.textContent).not.toContain('   2.');

    view.dispatch({ selection: { anchor: text.indexOf('sdv') } });

    // jsdom's .textContent concatenates sibling .cm-line divs with no
    // separator, so adjacent lines' text runs together without the
    // document's own "\n" — check for the revealed raw substring itself
    // rather than exact whole-DOM equality against the source text.
    expect(view.dom.textContent).toContain('   2. sdv');
  });

  it('does nothing for a top-level marker with no leading whitespace', () => {
    const text = '- top level item';
    const view = mountView(text, text.length);

    expect(view.dom.textContent).toBe(text);
  });

  it('does NOT collapse a blockquote-owned line\'s ">" into the whitespace range', () => {
    const text = '> - quoted bullet';
    // Engage the line so every Live-Preview mechanism on it (blockquote's
    // own "&gt;" hiding, and this module's whitespace-collapse) reveals its
    // raw form — proving this module didn't additionally swallow the "> "
    // prefix along with it. The guard rejects the range because it
    // contains "> ", not pure whitespace.
    const view = mountView(text, 0);

    expect(view.dom.textContent).toBe(text);
    expect(view.state.doc.toString()).toBe(text);
  });

  it('never modifies the document — only the rendered presentation', () => {
    const text = '1. Item\n   2. sdv\n      3. deeper';
    const view = mountView(text, text.length);

    expect(view.state.doc.toString()).toBe(text);
  });
});
