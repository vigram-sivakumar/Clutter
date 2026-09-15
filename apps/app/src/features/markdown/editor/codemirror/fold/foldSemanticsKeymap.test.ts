// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldedRanges, forceParsing } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({ doc, parent, extensions: [markdownLanguageExtension()] });
  forceParsing(view);
  return view;
}

function foldedRangeList(view: EditorView): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    ranges.push({ from, to });
  });
  return ranges;
}

/**
 * Dispatches the base (non-mac) binding — `Ctrl-Shift-[`/`Ctrl-Shift-]` —
 * rather than the `mac`-variant `Ctrl-Shift-[`/`Ctrl-Shift-]`, matching
 * `createEditorView.test.ts`'s own established precedent for testing
 * `foldKeymap`-shaped bindings: CM6's keymap facet picks the `mac`
 * variant based on runtime platform detection, which jsdom's own
 * `navigator.platform` doesn't reliably control — the base binding is
 * always active regardless of platform, so it's the one to test against.
 *
 * **Dispatches the actual shifted character (`{`/`}`), not the bare
 * `[`/`]` with `shiftKey: true`** — confirmed by tracing
 * `@codemirror/view`'s own `runHandlers`: for a "character" key (`.key`
 * is a single printable character), the *first* lookup CM6 tries
 * deliberately omits the `Shift-` prefix, trusting that a real browser's
 * `.key` already reflects the shifted character (Shift+[ reports `.key:
 * '{'` on a US layout, never `'['`). A synthetic event that instead sends
 * `key: '[', shiftKey: true` (the bare, unshifted character with the
 * modifier flag bolted on) is looked up as plain `Ctrl-[` in that first
 * pass — which collides with `@codemirror/commands`' own `defaultKeymap`
 * entry `Mod-[` (`indentLess`, which returns `true` unconditionally
 * whenever the document is editable, even as a no-op with nothing to
 * dedent) — so the event is fully handled and `preventDefault`-ed
 * *before* CM6 ever reaches the `Ctrl-Shift-[` lookup this file's own
 * keymap is registered under; `foldSemanticsKeymap` never even gets
 * asked. Sending the realistic shifted character (`{`/`}`, with
 * `keyCode: 219`/`221` — the physical key's code, unaffected by Shift —
 * so CM6's `keyCode`-based fallback branch still resolves correctly too)
 * reproduces what every real US-layout browser actually sends, sidesteps
 * the `Ctrl-[` collision entirely, and is what exercises the genuine
 * `Ctrl-Shift-[` binding path.
 */
function pressFoldShortcut(view: EditorView, key: '[' | ']'): void {
  const shiftedKey = key === '[' ? '{' : '}';
  const keyCode = key === '[' ? 219 : 221;
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: shiftedKey, keyCode, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
  );
}

describe('foldSemanticsKeymap — closes the native foldable() fallback loophole for Ctrl-Shift-[/Ctrl-Alt-[', () => {
  it('Ctrl-Shift-[ (foldCode) at a leaf list item with a lazy-continuation sibling does NOT fold — the exact loophole the native foldKeymap left open', () => {
    // Confirmed directly (prior investigation) that dispatching @codemirror/language's
    // own native `foldable()` for this exact document — even with
    // `listItemFoldService()` registered — still returns a real, non-null
    // range covering "Sibling paragraph", because a declining registered
    // foldService only means "ask someone else," and the generic native
    // foldNodeProp fallback still answers. foldSemanticsKeymap must never
    // reach that fallback for a list item.
    const doc = '- [ ] Parent\nSibling paragraph';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 2 } }); // cursor on "Parent"'s own line

    pressFoldShortcut(view, '[');

    expect(foldedRangeList(view)).toEqual([]);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Ctrl-Shift-[ at a task with a genuine nested paragraph folds only that paragraph', () => {
    const doc = '- [ ] Parent\n    Child paragraph\nSibling paragraph';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 2 } });

    pressFoldShortcut(view, '[');

    const parentLine = view.state.doc.line(1);
    const childLine = view.state.doc.line(2);
    expect(foldedRangeList(view)).toEqual([{ from: parentLine.to, to: childLine.to }]);
  });

  it('Ctrl-Shift-[ still folds a heading, delegating correctly to native semantics', () => {
    const doc = '# Heading\nbody';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 2 } });

    pressFoldShortcut(view, '[');

    expect(foldedRangeList(view)).toHaveLength(1);
  });

  it('Ctrl-Shift-] (unfoldCode) unfolds a fold at the cursor', () => {
    const doc = '# Heading\nbody';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 2 } });
    pressFoldShortcut(view, '[');
    expect(foldedRangeList(view)).toHaveLength(1);

    pressFoldShortcut(view, ']');

    expect(foldedRangeList(view)).toEqual([]);
  });

  it('Ctrl-Alt-[ (foldAll) folds every genuinely-foldable construct in the document and skips leaf list items entirely', () => {
    const doc = ['# Heading', 'body', '', '- [ ] Leaf task (no children)', 'Sibling paragraph'].join('\n');
    const view = mount(doc);

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '[', ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
    );

    const folds = foldedRangeList(view);
    // Exactly the heading fold — the leaf task never produces one.
    expect(folds).toHaveLength(1);
    const headingLine = view.state.doc.line(1);
    expect(folds[0]!.from).toBe(headingLine.to);
  });

  it('Ctrl-Alt-] (unfoldAll) unfolds every currently-folded range', () => {
    const doc = '# Heading\nbody';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 2 } });
    pressFoldShortcut(view, '[');
    expect(foldedRangeList(view)).toHaveLength(1);

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: ']', ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
    );

    expect(foldedRangeList(view)).toEqual([]);
  });
});
