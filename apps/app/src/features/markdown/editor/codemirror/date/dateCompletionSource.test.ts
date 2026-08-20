// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dateCompletionSource } from './dateCompletionSource';
import type { DateCompletion } from './dateCompletionRenderer';

function contextAt(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc, selection: { anchor: pos } });
  return new CompletionContext(state, pos, false);
}

/** dateCompletionSource is synchronous by construction — never returns a Promise — so tests can safely narrow the union CompletionSource's own type allows for. */
function call(source: CompletionSource, context: CompletionContext): CompletionResult | null {
  const result = source(context);
  if (result instanceof Promise) {
    throw new Error('dateCompletionSource is expected to be synchronous');
  }
  return result;
}

/**
 * Unit-level coverage for the source function in isolation — hand-built
 * `CompletionContext`s, no real CM6 completion state machine involved.
 * The accept-then-Space-must-not-reopen lifecycle question is deliberately
 * NOT tested here — a hand-built context can prove this function returns
 * the right value for a given position, but not that CM6 would ever call
 * it with that position, or call it at all, after a real Accept + Space.
 * See `dateCompletionLifecycle.test.ts` for that — real `semanticCompletion()`,
 * real typed keystrokes, real `acceptCompletion`.
 */
describe('dateCompletionSource', () => {
  it('offers only Today for a bare @ — always at most one result', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@', 1));
    expect(result).not.toBeNull();
    expect(result!.options.map((o) => o.label)).toEqual(['Today']);
  });

  it('offers Today, not Today + Tomorrow, for @t', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@t', 2));
    expect(result!.options.map((o) => o.label)).toEqual(['Today']);
  });

  it('stays active and resolves a multi-word expression spanning a space: @12 mar', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@12 mar', 7));
    expect(result).not.toBeNull();
    expect(result!.options.map((o) => o.label)).toEqual(['March 12, 2027']);
  });

  it('resolves the reordered form the same way: @mar 12', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@mar 12', 7));
    expect(result!.options.map((o) => o.label)).toEqual(['March 12, 2027']);
  });

  it('resolves the year+month+day form: @2027 jan 12', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@2027 jan 12', 12));
    expect(result!.options.map((o) => o.label)).toEqual(['January 12, 2027']);
  });

  it('terminates (returns null) once trailing text is no longer part of the Date expression, even though the trigger itself still bounds the token count', () => {
    const source = dateCompletionSource();
    expect(call(source, contextAt('@mar 12 lunch', 13))).toBeNull();
  });

  it('a complete ISO date followed by a space offers nothing — the expression is closed, not reopened', () => {
    const source = dateCompletionSource();
    expect(call(source, contextAt('@2026-08-20 ', 12))).toBeNull();
  });

  it('returns null when nothing matches — e.g. plain unrelated text after @', () => {
    const source = dateCompletionSource();
    expect(call(source, contextAt('@xyz', 4))).toBeNull();
  });

  it('accepting a suggestion inserts the canonical @YYYY-MM-DD form, not the display label', () => {
    const source = dateCompletionSource();
    const result = call(source, contextAt('@Tom', 4));
    const option = result!.options.find((o) => o.label === 'Tomorrow') as DateCompletion;
    expect(option).toBeDefined();
    expect(option.dateSuggestion.label).toBe('Tomorrow');
    expect(option.dateSuggestion.label).not.toBe(`@${option.dateSuggestion.isoDate}`);

    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: '@Tom',
        selection: { anchor: 4 },
        extensions: [markdownLanguageExtension()],
      }),
      parent,
    });

    (option.apply as (view: EditorView, completion: DateCompletion, from: number, to: number) => void)(
      view,
      option,
      result!.from,
      4
    );

    expect(view.state.doc.toString()).toBe(`@${option.dateSuggestion.isoDate}`);
    expect(view.state.doc.toString()).not.toContain('Tomorrow');
  });

  it('the same insertion happens regardless of whether the completion position is on a task line or ordinary content — no task-context branching at the completion layer', () => {
    const source = dateCompletionSource();

    const ordinaryResult = call(source, contextAt('Meet @Tom', 9));
    const taskResult = call(source, contextAt('- [ ] Finish report @Tom', 24));

    const ordinaryOption = ordinaryResult!.options.find((o) => o.label === 'Tomorrow') as DateCompletion;
    const taskOption = taskResult!.options.find((o) => o.label === 'Tomorrow') as DateCompletion;

    expect(ordinaryOption.dateSuggestion.isoDate).toBe(taskOption.dateSuggestion.isoDate);
  });

  it('does not activate when the query looks like an @key:value property token (e.g. legacy @due:)', () => {
    const source = dateCompletionSource();
    expect(call(source, contextAt('@due:2026-08-20', 15))).toBeNull();
  });

  it('never touches document state — a pure query-in, options-out function', () => {
    const source = dateCompletionSource();
    const context = contextAt('@Today', 6);
    const before = context.state.doc.toString();
    call(source, context);
    expect(context.state.doc.toString()).toBe(before);
  });
});
