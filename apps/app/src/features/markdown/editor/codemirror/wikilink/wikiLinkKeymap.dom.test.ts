// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import { wikiLinkKeymap } from './wikiLinkKeymap';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * `wikiLinkKeymap.test.ts` calls `hopRight`/`hopLeft`/`activateAdjacent`
 * directly as plain functions — it says so itself, because calling a
 * function directly proves the function's own logic but says nothing
 * about whether any key is actually *wired* to it. This file is the
 * complement: it mounts the real `wikiLinkKeymap(...)` extension and
 * dispatches a genuine `keydown` at `view.contentDOM` (the same pattern
 * `createEditorView.test.ts`'s own `pressEnter` helper already
 * establishes), so what's under test is the wiring itself — specifically,
 * the deliberate absence of any Enter/Mod-Enter binding to activation
 * (`tokenKeymap.ts`'s own doc comment: WikiLink activation is mouse-only
 * by explicit product decision, not an oversight).
 *
 * `defaultKeymap` (CM6's own, for plain-newline Enter) is included
 * because without it there is no baseline "what does Enter actually do"
 * to assert against — `wikiLinkKeymap` alone was never responsible for
 * newline insertion, only for a token construct's own bindings.
 */
function mountView(doc: string, cursorPos: number, resolver: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [
      markdownLanguageExtension(),
      wikiLinkDecorations(() => resolver),
      wikiLinkKeymap(() => resolver),
      keymap.of(defaultKeymap),
    ],
  });
  return new EditorView({ state, parent });
}

function pressKey(view: EditorView, key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}): void {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  );
}

describe('WikiLink keyboard activation — real DOM event path (mouse-only by design)', () => {
  it('plain Enter one position after an at-rest WikiLink does not activate — it inserts a normal newline', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    // node = [2, 19) for '[[Projects/Page]]'; one position after its end (19) is 20.
    const view = mountView('x [[Projects/Page]] y', 20, resolver);

    pressKey(view, 'Enter');

    expect(activate).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('x [[Projects/Page]] \ny');
    view.destroy();
  });

  it('plain Enter one position before an at-rest WikiLink does not activate — it inserts a normal newline', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('x [[Projects/Page]] y', 1, resolver);

    pressKey(view, 'Enter');

    expect(activate).not.toHaveBeenCalled();
    // CM6's own default Enter command trims trailing whitespace off the
    // line being split — the leading space before "[[" is gone, not a
    // WikiLink-specific effect.
    expect(view.state.doc.toString()).toBe('x\n[[Projects/Page]] y');
    view.destroy();
  });

  it('Ctrl+Enter adjacent to an at-rest WikiLink does not activate it either', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('x [[Projects/Page]] y', 20, resolver);

    pressKey(view, 'Enter', { ctrlKey: true });

    expect(activate).not.toHaveBeenCalled();
    view.destroy();
  });

  it('Cmd+Enter (metaKey) adjacent to an at-rest WikiLink does not activate it either', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('x [[Projects/Page]] y', 20, resolver);

    pressKey(view, 'Enter', { metaKey: true });

    expect(activate).not.toHaveBeenCalled();
    view.destroy();
  });

  it('plain Enter with the caret inside the engaged WikiLink text also does not activate — still a normal newline', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('x [[Projects/Page]] y', 5, resolver); // inside the node

    pressKey(view, 'Enter');

    expect(activate).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('x [[P\nrojects/Page]] y');
    view.destroy();
  });

  it('ArrowRight/ArrowLeft hop bindings are unaffected by the Enter-binding removal', () => {
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const view = mountView('x [[Projects/Page]] y', 1, resolver);

    pressKey(view, 'ArrowRight');

    // Enters from the near (left) boundary — the side approached from.
    expect(view.state.selection.main.head).toBe(2);
  });

  it('ArrowLeft from the visible filename hops over the concealed folder prefix via a real keydown', () => {
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    // 'x [[Projects/Note]] y' — reference zone [4, 17), folder "Projects/"
    // occupies [4, 13), visible filename "Note" starts at 13.
    const view = mountView('x [[Projects/Note]] y', 13, resolver);

    pressKey(view, 'ArrowLeft');

    expect(view.state.selection.main.head).toBe(4);
    view.destroy();
  });
});
