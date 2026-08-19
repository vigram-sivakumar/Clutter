// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { semanticTokenDecorations } from './tokenDecorations';
import { activateAdjacentToken, hopLeft, hopRight } from './tokenKeymap';
import { handleTokenClick, isWithinTokenBounds } from './tokenMouseHandlers';
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

/**
 * Reproduces and fixes the reported bug: a token that is the last thing
 * on its line makes the rest of that line's empty trailing space
 * activate it. Root cause, confirmed directly (not assumed): posAtCoords
 * resolves any click to the *nearest* character position — a click past
 * the last rendered character on a line has nothing closer to resolve
 * to than the line's own end, which for a line-ending token is exactly
 * its own `to` boundary. `findAtRestTokenAt`'s inclusive `pos <= node.to`
 * then correctly treats that shared position as a hit — a pure
 * document-position check cannot tell "clicked exactly at the boundary"
 * apart from "clicked far past all content, snapped there for lack of
 * anything closer," since both produce the identical position.
 * `isWithinTokenBounds` closes this by checking actual pixel coordinates
 * against the token's real rendered rect.
 */
function fakeRect(left: number, right: number): DOMRect {
  return { left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0 } as DOMRect;
}

describe('isWithinTokenBounds — generic', () => {
  it('a click within the token\'s rendered rect is within bounds', () => {
    const view = mountView('x [[Projects/Page]] y', 0);
    vi.spyOn(view, 'coordsAtPos').mockReturnValue(fakeRect(130, 190));

    expect(isWithinTokenBounds(view, { from: 2, to: 19 }, 150, 10)).toBe(true);
  });

  it('a click far past the token\'s rendered rect (same resolved document position) is rejected', () => {
    const view = mountView('x [[Projects/Page]] y', 0);
    vi.spyOn(view, 'coordsAtPos').mockReturnValue(fakeRect(130, 190));

    // e.g. a click at x=600 in empty trailing line space, where
    // posAtCoords nonetheless resolved to a position inside/at the token
    // (nothing else on the line for it to snap to).
    expect(isWithinTokenBounds(view, { from: 2, to: 19 }, 600, 10)).toBe(false);
  });

  it('falls back to true when geometry is unavailable, rather than blocking activation', () => {
    const view = mountView('x [[Projects/Page]] y', 0);
    vi.spyOn(view, 'coordsAtPos').mockReturnValue(null);

    expect(isWithinTokenBounds(view, { from: 2, to: 19 }, 999, 999)).toBe(true);
  });
});

describe('hopRight / hopLeft — generic', () => {
  it('hops in from the left (near) boundary from one position before an at-rest node', () => {
    const view = mountView('x [[Projects/Page]] y', 1);
    expect(hopRight(view, isFixtureToken)).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('hops in from the right (near) boundary from one position after an at-rest node', () => {
    const view = mountView('x [[Projects/Page]] y', 20);
    expect(hopLeft(view, isFixtureToken)).toBe(true);
    expect(view.state.selection.main.head).toBe(19);
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
