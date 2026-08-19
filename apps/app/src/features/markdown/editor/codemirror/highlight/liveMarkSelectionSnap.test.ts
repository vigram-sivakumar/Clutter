// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { emphasisMarkerDecoration } from './emphasisMarkerDecoration';
import { headingMarkerDecoration } from './headingMarkerDecoration';
import { markdownHighlighting } from './markdownHighlightStyle';

/**
 * Simulates what a real mouse click actually dispatches — a selection-only
 * transaction tagged `userEvent: 'select.pointer'`, the exact tag CM6's own
 * click/drag handling applies (confirmed against the installed
 * `@codemirror/view` source — see liveMarkSelectionSnap.ts's doc comment).
 * A bare `{selection: ...}` dispatch (no userEvent) is a *different*,
 * deliberately-unaffected case, already covered by
 * emphasisMarkerDecoration.test.ts/headingMarkerDecoration.test.ts.
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
    extensions: [
      markdownLanguageExtension(),
      markdownHighlighting(),
      emphasisMarkerDecoration(),
      headingMarkerDecoration(),
    ],
  });
  return new EditorView({ state, parent });
}

/**
 * Each case: `text` is the full document, `node` is the construct's own
 * [from, to), `beforeClick`/`afterClick` are the raw (ambiguous) positions
 * a real click resolves to per the confirmed browser reproduction — the
 * position immediately adjacent to the visible text, on the marker side —
 * and `mid` is an ordinary click strictly inside the visible text.
 */
const cases = [
  {
    label: '*italic*',
    text: 'x *italic* y',
    node: { from: 2, to: 10 },
    beforeClick: 3,
    afterClick: 9,
    mid: 6,
  },
  {
    label: '_italic_',
    text: 'x _italic_ y',
    node: { from: 2, to: 10 },
    beforeClick: 3,
    afterClick: 9,
    mid: 6,
  },
  {
    label: '**bold**',
    text: 'x **bold** y',
    node: { from: 2, to: 10 },
    beforeClick: 4,
    afterClick: 8,
    mid: 6,
  },
  {
    label: '__bold__',
    text: 'x __bold__ y',
    node: { from: 2, to: 10 },
    beforeClick: 4,
    afterClick: 8,
    mid: 6,
  },
  {
    // "x ***bi*** y": x(0) sp(1) *(2)*(3)*(4) b(5) i(6) *(7)*(8)*(9) sp(10) y(11)
    label: '***bold italic***',
    text: 'x ***bi*** y',
    node: { from: 2, to: 10 },
    beforeClick: 5,
    afterClick: 7,
    mid: 6,
  },
  {
    label: '___bold italic___',
    text: 'x ___bi___ y',
    node: { from: 2, to: 10 },
    beforeClick: 5,
    afterClick: 7,
    mid: 6,
  },
] as const;

describe('liveMarkSelectionSnap — click boundary correction, shared across every marker-hiding construct', () => {
  describe.each(cases)('$label', ({ text, node, beforeClick, afterClick, mid }) => {
    it('click immediately before the visible content lands before the entire construct', () => {
      const view = mountView(text, text.length); // starts fully at rest

      click(view, beforeClick);

      expect(view.state.selection.main.head).toBe(node.from);
    });

    it('click immediately after the visible content lands after the entire construct', () => {
      const view = mountView(text, text.length);

      click(view, afterClick);

      expect(view.state.selection.main.head).toBe(node.to);
    });

    it('click inside the visible text lands exactly where clicked, unmoved', () => {
      const view = mountView(text, text.length);

      click(view, mid);

      expect(view.state.selection.main.head).toBe(mid);
    });
  });

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
    const text = 'x __bold__ y';
    const view = mountView(text, text.length);

    // No userEvent — a direct programmatic dispatch, not a click.
    view.dispatch({ selection: { anchor: 5 } }); // strictly inside the opening "__"

    expect(view.state.selection.main.head).toBe(5);
  });

  it('does not affect keyboard-driven selection (tagged select.keyboard, not select.pointer)', () => {
    const text = 'x __bold__ y';
    const view = mountView(text, text.length);

    view.dispatch({ selection: { anchor: 5 }, userEvent: 'select.keyboard' });

    expect(view.state.selection.main.head).toBe(5);
  });

  it('an already-engaged construct is never snapped by a click inside it', () => {
    const text = 'x **bold** y';
    const view = mountView(text, text.length);

    click(view, 5); // engage first, cursor inside "bold"
    expect(view.state.selection.main.head).toBe(5);

    click(view, 4); // still within the now-engaged node
    expect(view.state.selection.main.head).toBe(4);
  });

  it('does not interfere with a drag-selection that sweeps across a construct from outside to outside', () => {
    const text = 'x **bold** y';
    const view = mountView(text, text.length);

    view.dispatch({
      selection: { anchor: 0, head: text.length },
      userEvent: 'select.pointer',
    });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(text.length);
  });

  it('never applies to a document-changing transaction', () => {
    const text = 'x **bold** y';
    const view = mountView(text, text.length);

    view.dispatch({ changes: { from: 5, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x **b!old** y');
  });
});
