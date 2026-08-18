// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { semanticTokenDecorations } from './tokenDecorations';
import { activateAdjacentToken, hopLeft, hopRight } from './tokenKeymap';
import { handleTokenClick } from './tokenMouseHandlers';
import { tokenSelectionSnap } from './tokenSelectionSnap';

/**
 * Covers the third extracted mechanism — hop/activate/mouse interaction —
 * generically, the same way tokenEngagement.test.ts and
 * tokenDecorations.test.ts cover the first two. See those files' doc
 * comments for why a WikiLink-grammar fixture is used without making the
 * mechanism itself WikiLink-specific.
 */
const isFixtureToken = (name: string): boolean => name === 'WikiLink';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [
      markdownLanguageExtension(),
      semanticTokenDecorations(isFixtureToken, () => null),
      tokenSelectionSnap(isFixtureToken),
    ],
  });
  return new EditorView({ state, parent });
}

describe('handleTokenClick — generic', () => {
  it('a plain click on an at-rest token activates it', () => {
    const activate = vi.fn();
    const view = mountView('x [[Projects/Page]] y', 0);

    const handled = handleTokenClick(view, 5, false, isFixtureToken, () => activate);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click engages instead of activating', () => {
    const activate = vi.fn();
    const view = mountView('x [[Projects/Page]] y', 0);

    const handled = handleTokenClick(view, 5, true, isFixtureToken, () => activate);

    expect(handled).toBe(true);
    expect(activate).not.toHaveBeenCalled();
  });

  it('is not handled when getActivation returns null (not a valid token instance)', () => {
    const view = mountView('x [[Projects/Page]] y', 0);

    expect(handleTokenClick(view, 5, false, isFixtureToken, () => null)).toBe(false);
  });

  it('is not handled when no token is at pos', () => {
    const activate = vi.fn();
    const view = mountView('x [[Projects/Page]] y', 0);

    expect(handleTokenClick(view, 0, false, isFixtureToken, () => activate)).toBe(false);
  });
});

describe('hopRight / hopLeft — generic', () => {
  it('hops to the far boundary from one position before an at-rest node', () => {
    const view = mountView('x [[Projects/Page]] y', 1);
    expect(hopRight(view, isFixtureToken)).toBe(true);
    expect(view.state.selection.main.head).toBe(19);
  });

  it('hops to the near boundary from one position after an at-rest node', () => {
    const view = mountView('x [[Projects/Page]] y', 20);
    expect(hopLeft(view, isFixtureToken)).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('does nothing when not adjacent to a token', () => {
    const view = mountView('hello world', 3);
    expect(hopRight(view, isFixtureToken)).toBe(false);
  });
});

describe('activateAdjacentToken — generic', () => {
  it('activates a token one position before or after the caret', () => {
    const activate = vi.fn();
    const before = mountView('x [[Projects/Page]] y', 1);
    expect(activateAdjacentToken(before, isFixtureToken, () => activate)).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);

    const activateAfter = vi.fn();
    const after = mountView('x [[Projects/Page]] y', 20);
    expect(activateAdjacentToken(after, isFixtureToken, () => activateAfter)).toBe(true);
    expect(activateAfter).toHaveBeenCalledTimes(1);
  });

  it('does not activate when the caret is inside the node (engaged, not adjacent)', () => {
    const activate = vi.fn();
    const view = mountView('x [[Projects/Page]] y', 5);
    expect(activateAdjacentToken(view, isFixtureToken, () => activate)).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });
});

describe('tokenSelectionSnap — generic', () => {
  it('snaps a selection endpoint landing strictly inside an at-rest node to the nearer boundary', () => {
    const view = mountView('x [[Projects/Page]] y', 0);

    view.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(view.state.selection.main.to).toBe(2);
  });

  it('does not touch a selection spanning fully across the node from outside to outside', () => {
    const view = mountView('x [[Projects/Page]] y', 0);

    view.dispatch({ selection: { anchor: 0, head: 21 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(21);
  });
});
