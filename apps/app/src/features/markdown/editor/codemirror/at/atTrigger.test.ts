// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';

import { extractAtTriggerQuery } from './atTrigger';

function contextAt(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc, selection: { anchor: pos } });
  return new CompletionContext(state, pos, false);
}

describe('extractAtTriggerQuery', () => {
  it('matches a bare @ with an empty query', () => {
    const result = extractAtTriggerQuery(contextAt('@', 1));
    expect(result).toEqual({ from: 0, query: '' });
  });

  it('matches @ followed by in-progress text', () => {
    const result = extractAtTriggerQuery(contextAt('@Tom', 4));
    expect(result).toEqual({ from: 0, query: 'Tom' });
  });

  it('matches starting mid-document', () => {
    const result = extractAtTriggerQuery(contextAt('Meet @Tom', 9));
    expect(result).toEqual({ from: 5, query: 'Tom' });
  });

  it('does not match when there is no @ before the cursor', () => {
    expect(extractAtTriggerQuery(contextAt('hello', 5))).toBeNull();
  });

  it('does not match across a space — an @-word never spans whitespace', () => {
    expect(extractAtTriggerQuery(contextAt('@foo bar', 8))).toBeNull();
  });

  it('does not match across a newline', () => {
    expect(extractAtTriggerQuery(contextAt('@foo\nbar', 8))).toBeNull();
  });

  it('is permissive about what follows @ — narrowing to a specific shape is each source’s own job, not this boundary’s', () => {
    const result = extractAtTriggerQuery(contextAt('@2026-08-20', 11));
    expect(result).toEqual({ from: 0, query: '2026-08-20' });
  });
});
