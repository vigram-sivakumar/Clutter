// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAtRestTokenAt, findTokenAt, isTokenEngaged } from './tokenEngagement';

/**
 * Exercises the generic engagement/query mechanism directly, decoupled
 * from WikiLink — using the WikiLink Lezer node purely as an available
 * fixture grammar (the only concrete semantic-inline kind that exists
 * today), not because the mechanism is WikiLink-specific. A second real
 * kind would use a different predicate against the exact same functions.
 */
const isFixtureToken = (name: string): boolean => name === 'WikiLink';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

describe('tokenEngagement — generic, predicate-driven', () => {
  it('findTokenAt finds a node matching the predicate containing pos', () => {
    const state = stateFor('x [[Projects/Page]] y');
    expect(findTokenAt(state, 5, isFixtureToken)).toEqual({ from: 2, to: 19 });
  });

  it('findTokenAt returns null for a predicate that matches nothing', () => {
    const state = stateFor('x [[Projects/Page]] y');
    expect(findTokenAt(state, 5, () => false)).toBeNull();
  });

  it('isTokenEngaged is true iff the selection is contained in the node range, inclusive of boundaries', () => {
    const state = stateFor('x [[Projects/Page]] y');
    const node = { from: 2, to: 19 };

    expect(isTokenEngaged(state.update({ selection: { anchor: 2 } }).state, node)).toBe(true);
    expect(isTokenEngaged(state.update({ selection: { anchor: 19 } }).state, node)).toBe(true);
    expect(isTokenEngaged(state.update({ selection: { anchor: 10 } }).state, node)).toBe(true);
    expect(isTokenEngaged(state.update({ selection: { anchor: 0 } }).state, node)).toBe(false);
  });

  it('findAtRestTokenAt returns null once the node is engaged', () => {
    const state = stateFor('x [[Projects/Page]] y');
    const engaged = state.update({ selection: { anchor: 5 } }).state;

    expect(findAtRestTokenAt(state, 5, isFixtureToken)).toEqual({ from: 2, to: 19 });
    expect(findAtRestTokenAt(engaged, 5, isFixtureToken)).toBeNull();
  });
});
