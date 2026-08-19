// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { activateAdjacent, hopLeft, hopOverConcealedLeft, hopOverConcealedRight, hopRight } from './wikiLinkKeymap';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * These call hopRight/hopLeft/activateAdjacent directly as plain
 * functions, not via a simulated ArrowRight/Enter keydown through jsdom
 * and CM6's key-handling pipeline. Confirmed necessary, not a shortcut:
 * calling CM6's own `cursorCharRight` command directly (an earlier draft
 * of this file did) silently bypasses a custom `keymap.of(...)` binding
 * entirely, since key dispatch only happens through real keyboard events —
 * this was caught by the test actually failing (moved one character, not
 * to the far boundary) rather than assumed.
 *
 * Test document throughout: 'x [[Projects/Page]] y' — the WikiLink spans
 * [2, 19) (17 characters: `[[Projects/Page]]`), confirmed by explicit
 * count, not assumed — an earlier draft of this file got this span wrong
 * by one character and had to be corrected once the tests exposed it.
 */
function mountView(doc: string, cursorPos: number, resolver?: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension(), wikiLinkDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

const resolvedAs = (displayLabel: string, activate = vi.fn()): ResolveWikiLink => () => ({
  status: 'resolved',
  displayLabel,
  activate,
});

describe('hopRight / hopLeft — empirically-motivated arrow-key correction', () => {
  it('one position before an at-rest WikiLink, hopRight hops in from the left (near) boundary, not the far one', () => {
    // node = [2, 19); one position before its start is 1. Entering by
    // ArrowRight from the left must land on the node's own left edge (2),
    // never jump clean through to the far/right edge (19) — the caret must
    // never appear to have passed through the token in one press.
    const view = mountView('x [[Projects/Page]] y', 1, resolvedAs('X'));

    const handled = hopRight(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
  });

  it('the hop lands the caret in an engaged (revealed) position, not still at rest', () => {
    const view = mountView('x [[Projects/Page]] y', 1, resolvedAs('X'));

    hopRight(view);

    expect(view.dom.querySelector('[data-wikilink-status]')).toBeNull();
    expect(view.dom.textContent).toContain('[[Projects/Page]]');
  });

  it('one position after an at-rest WikiLink, hopLeft hops in from the right (near) boundary, not the far one', () => {
    // one position after the node's end (19) is 20. Entering by ArrowLeft
    // from the right must land on the node's own right edge (19), never
    // jump clean through to the far/left edge (2).
    const view = mountView('x [[Projects/Page]] y', 20, resolvedAs('X'));

    const handled = hopLeft(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(19);
  });

  it('hopLeft across a non-whitespace intervening character still enters from the right (near) boundary', () => {
    // node = [2, 19), followed directly by 'z' (no space) at [19, 20) —
    // confirms the near-boundary landing isn't special-cased to whitespace
    // gaps; any single intervening character triggers the same one-hop.
    const view = mountView('x [[Projects/Page]]z', 20, resolvedAs('X'));

    const handled = hopLeft(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(19);
  });

  it('hopRight across a non-whitespace intervening character still enters from the left (near) boundary', () => {
    // 'z' occupies [0, 1) directly before the node (no space); node = [1, 19).
    // Position 0 is one position before the node, across that single 'z'.
    const view = mountView('z[[Projects/Page]] y', 0, resolvedAs('X'));

    const handled = hopRight(view);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(1);
  });

  it('returns false (does not handle) when not adjacent to a WikiLink at all', () => {
    const view = mountView('hello world', 3, resolvedAs('X'));

    expect(hopRight(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(3);
  });

  it('returns false for a non-empty selection — hop is only for a plain caret', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const resolver = resolvedAs('X');
    const state = EditorState.create({
      doc: 'x [[Projects/Page]] y',
      selection: { anchor: 0, head: 1 },
      extensions: [markdownLanguageExtension(), wikiLinkDecorations(() => resolver)],
    });
    const view = new EditorView({ state, parent });

    expect(hopRight(view)).toBe(false);
  });

  it('returns false when already inside the node (not adjacent from outside)', () => {
    const view = mountView('x [[Projects/Page]] y', 5, resolvedAs('X')); // strictly inside [2, 19)

    expect(hopRight(view)).toBe(false);
    expect(hopLeft(view)).toBe(false);
  });

  it('returns false exactly at the node boundary — that position is already engaged, not "one step before at-rest"', () => {
    // A genuine, non-obvious consequence of the inclusive-boundary
    // engagement rule: position 2 (node.from) is itself always engaged,
    // never "adjacent to an at-rest node" — the adjacent position is 1.
    const view = mountView('x [[Projects/Page]] y', 2, resolvedAs('X'));

    expect(hopRight(view)).toBe(false);
  });
});

describe('activateAdjacent — Enter activates a WikiLink one position before or after it', () => {
  it('activates when the caret is one position after (touching, from outside, the far boundary of) an at-rest WikiLink', () => {
    const activate = vi.fn();
    const resolver = resolvedAs('X', activate);
    const view = mountView('x [[Projects/Page]] y', 20, resolver);

    const handled = activateAdjacent(() => resolver)(view);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('activates when the caret is one position before (touching, from outside, the near boundary of) an at-rest WikiLink', () => {
    const activate = vi.fn();
    const resolver = resolvedAs('X', activate);
    const view = mountView('x [[Projects/Page]] y', 1, resolver);

    const handled = activateAdjacent(() => resolver)(view);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('does not activate when the caret is inside engaged raw text — that is ordinary Enter, not activation', () => {
    const activate = vi.fn();
    const resolver = resolvedAs('X', activate);
    const view = mountView('x [[Projects/Page]] y', 5, resolver); // inside the node

    const handled = activateAdjacent(() => resolver)(view);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate exactly at the node boundary — already engaged, not "adjacent"', () => {
    const activate = vi.fn();
    const resolver = resolvedAs('X', activate);
    const view = mountView('x [[Projects/Page]] y', 2, resolver);

    expect(activateAdjacent(() => resolver)(view)).toBe(false);
  });

  it('does not activate when nowhere near a WikiLink', () => {
    const activate = vi.fn();
    const resolver = resolvedAs('X', activate);
    const view = mountView('hello world', 3, resolver);

    expect(activateAdjacent(() => resolver)(view)).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back gracefully (no throw) when no resolver is provided', () => {
    const view = mountView('x [[Projects/Page]] y', 20);

    expect(() => activateAdjacent(() => undefined)(view)).not.toThrow();
  });
});

describe('hopOverConcealedLeft / hopOverConcealedRight — jump across the concealed folder prefix', () => {
  // 'x [[Projects/Note]] y' — node = [2, 19), reference zone = [4, 17)
  // ("Projects/Note", no alias). The folder prefix "Projects/" occupies
  // [4, 13); the visible filename "Note" starts at 13.
  const DOC = 'x [[Projects/Note]] y';

  it('ArrowLeft from the start of the visible filename jumps to the start of the reference, in one call', () => {
    const view = mountView(DOC, 13, resolvedAs('X'));

    expect(hopOverConcealedLeft(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(4);
  });

  it('ArrowRight from the start of the reference jumps to the start of the visible filename, in one call', () => {
    const view = mountView(DOC, 4, resolvedAs('X'));

    expect(hopOverConcealedRight(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(13);
  });

  it('does not fire from a position that is not exactly at the concealed boundary', () => {
    const view = mountView(DOC, 8, resolvedAs('X')); // mid-way through "Projects"

    expect(hopOverConcealedLeft(view)).toBe(false);
    expect(hopOverConcealedRight(view)).toBe(false);
  });

  it('does not fire when the reference has no folder component to conceal', () => {
    const view = mountView('x [[Note]] y', 6, resolvedAs('X')); // start of the (folder-less) reference

    expect(hopOverConcealedLeft(view)).toBe(false);
    expect(hopOverConcealedRight(view)).toBe(false);
  });

  it('does not fire when the WikiLink is not engaged (cursor outside it)', () => {
    const view = mountView(DOC, 0, resolvedAs('X'));

    expect(hopOverConcealedLeft(view)).toBe(false);
    expect(hopOverConcealedRight(view)).toBe(false);
  });

  it('does not fire for a non-empty selection', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: DOC,
      selection: { anchor: 13, head: 14 },
      extensions: [markdownLanguageExtension(), wikiLinkDecorations(() => resolvedAs('X'))],
    });
    const view = new EditorView({ state, parent });

    expect(hopOverConcealedLeft(view)).toBe(false);
  });

  it('respects the LAST unescaped slash for a nested path', () => {
    // 'x [[Projects/Project A/Note]] y' — visible filename starts right
    // after the second "/", not the first.
    const doc = 'x [[Projects/Project A/Note]] y';
    const visibleStart = doc.indexOf('Note');

    const view = mountView(doc, visibleStart, resolvedAs('X'));

    expect(hopOverConcealedLeft(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.indexOf('Projects'));
  });
});
