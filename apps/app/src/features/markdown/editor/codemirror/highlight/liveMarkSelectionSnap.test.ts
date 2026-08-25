// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { headingMarkerDecoration } from './headingMarkerDecoration';

/**
 * Simulates what a real mouse click actually dispatches — a selection-only
 * transaction tagged `userEvent: 'select.pointer'`, the exact tag CM6's own
 * click/drag handling applies (confirmed against the installed
 * `@codemirror/view` source — see liveMarkSelectionSnap.ts's doc comment).
 * A bare `{selection: ...}` dispatch (no userEvent) is a *different*,
 * deliberately-unaffected case, already covered by
 * headingMarkerDecoration.test.ts.
 *
 * Emphasis/Strikethrough are no longer exercised here: their own
 * `emphasisMarkerDecoration()`/`strikethroughMarkerDecoration()` were
 * retired (superseded by `inlineLivePreviewRegion`'s shared mechanism,
 * which does not use `liveMarkDecoration`/`liveMarkSelectionSnap` at all —
 * see docs/editor-architecture-decisions.md's "Duplicate decoration
 * ownership cleanup" entry). `liveMarkSelectionSnap` itself remains a real,
 * still-used mechanism (heading, and dormant blockquote/list), so its
 * generic behavior is still covered below via heading alone.
 */
function click(view: EditorView, pos: number): void {
  const spec: TransactionSpec = { selection: { anchor: pos }, userEvent: 'select.pointer' };
  view.dispatch(spec);
}

function mountView(doc: string, initialAnchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), headingMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('liveMarkSelectionSnap — click boundary correction, shared across every marker-hiding construct', () => {
  describe('# heading', () => {
    it('click immediately before the visible title lands before the "# " prefix', () => {
      const text = '# Heading\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      click(view, 2); // right after "# ", before "Heading"

      expect(view.state.selection.main.head).toBe(0);
    });

    it('## click before visible title skips both the hash run and the separator', () => {
      const text = '## Subheading\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      click(view, 3); // right after "## ", before "Subheading"

      expect(view.state.selection.main.head).toBe(0);
    });

    it('click inside the visible title lands exactly where clicked', () => {
      const text = '# Heading\n\nOther';
      const view = mountView(text, text.indexOf('Other'));

      click(view, 5); // inside "Heading"

      expect(view.state.selection.main.head).toBe(5);
    });
  });

  it('does not affect a plain (non-pointer) selection dispatch — matches the existing, deliberately-unaffected behavior', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    // No userEvent — a direct programmatic dispatch, not a click.
    view.dispatch({ selection: { anchor: 1 } }); // strictly inside the "# " marker

    expect(view.state.selection.main.head).toBe(1);
  });

  it('does not affect keyboard-driven selection (tagged select.keyboard, not select.pointer)', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    view.dispatch({ selection: { anchor: 1 }, userEvent: 'select.keyboard' });

    expect(view.state.selection.main.head).toBe(1);
  });

  it('an already-engaged construct is never snapped by a click inside it', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    click(view, 5); // engage first, cursor inside "Heading"
    expect(view.state.selection.main.head).toBe(5);

    click(view, 1); // still within the now-engaged node
    expect(view.state.selection.main.head).toBe(1);
  });

  it('does not interfere with a drag-selection that sweeps across a construct from outside to outside', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    view.dispatch({
      selection: { anchor: 0, head: text.length },
      userEvent: 'select.pointer',
    });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(text.length);
  });

  it('never applies to a document-changing transaction', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    view.dispatch({ changes: { from: 5, insert: '!' } });

    expect(view.state.doc.toString()).toBe('# Hea!ding\n\nOther');
  });
});
