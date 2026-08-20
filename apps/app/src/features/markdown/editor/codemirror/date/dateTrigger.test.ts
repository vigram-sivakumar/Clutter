import { describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';

import { extractDateTriggerQuery } from './dateTrigger';

function contextAt(doc: string, pos: number): CompletionContext {
  const state = EditorState.create({ doc, selection: { anchor: pos } });
  return new CompletionContext(state, pos, false);
}

describe('extractDateTriggerQuery', () => {
  it('matches a bare @ with an empty query', () => {
    const match = extractDateTriggerQuery(contextAt('@', 1));
    expect(match).toEqual({ from: 0, query: '' });
  });

  it('matches a single-word query, same as the shared single-word trigger would', () => {
    const match = extractDateTriggerQuery(contextAt('@mar', 4));
    expect(match).toEqual({ from: 0, query: 'mar' });
  });

  it('stays active across a space mid-expression: @12 mar', () => {
    const match = extractDateTriggerQuery(contextAt('@12 mar', 7));
    expect(match).toEqual({ from: 0, query: '12 mar' });
  });

  it('stays active across a space mid-expression: @mar 12', () => {
    const match = extractDateTriggerQuery(contextAt('@mar 12', 7));
    expect(match).toEqual({ from: 0, query: 'mar 12' });
  });

  it('stays active across two spaces for the year+month+day form: @2027 jan 12', () => {
    const match = extractDateTriggerQuery(contextAt('@2027 jan 12', 12));
    expect(match).toEqual({ from: 0, query: '2027 jan 12' });
  });

  it('is live immediately after the trailing space, before the next token is typed', () => {
    const match = extractDateTriggerQuery(contextAt('@12 ', 4));
    expect(match).toEqual({ from: 0, query: '12 ' });
  });

  it('terminates once a 4th space-separated token is typed — no supported grammar form is that long', () => {
    const match = extractDateTriggerQuery(contextAt('@2027 jan 12 13', 15));
    expect(match).toBeNull();
  });

  it('does not match when a space follows @ directly', () => {
    const match = extractDateTriggerQuery(contextAt('@ mar', 5));
    expect(match).toBeNull();
  });

  it('does not cross a newline', () => {
    const match = extractDateTriggerQuery(contextAt('@mar\n12', 7));
    expect(match).toBeNull();
  });

  it('requires whitespace-or-start immediately before @ (rejects foo@mar)', () => {
    const match = extractDateTriggerQuery(contextAt('foo@mar', 7));
    expect(match).toBeNull();
  });

  it('finds the nearest preceding @ within the token-count bound', () => {
    const match = extractDateTriggerQuery(contextAt('x @mar', 6));
    expect(match).toEqual({ from: 2, query: 'mar' });
  });

  describe('closed-expression termination (a complete @YYYY-MM-DD never continues)', () => {
    it('a complete ISO date with no trailing content still matches — the single-suggestion echo-back case', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20', 11));
      expect(match).toEqual({ from: 0, query: '2026-08-20' });
    });

    it('@2026-08-20 followed by a space no longer matches at all — the expression is closed', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20 ', 12));
      expect(match).toBeNull();
    });

    it('@2026-08-20 followed by more text (not just a space) still does not match', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20 mar', 15));
      expect(match).toBeNull();
    });

    it('@12 mar remains active — "12" alone is a prefix, not a closed ISO shape', () => {
      const match = extractDateTriggerQuery(contextAt('@12 mar', 7));
      expect(match).toEqual({ from: 0, query: '12 mar' });
    });

    it('@mar 12 remains active', () => {
      const match = extractDateTriggerQuery(contextAt('@mar 12', 7));
      expect(match).toEqual({ from: 0, query: 'mar 12' });
    });

    it('@2027 jan remains active — "2027" alone is a prefix, not a closed ISO shape', () => {
      const match = extractDateTriggerQuery(contextAt('@2027 jan', 9));
      expect(match).toEqual({ from: 0, query: '2027 jan' });
    });

    it('@2027 jan 12 remains active through the full 3-token form', () => {
      const match = extractDateTriggerQuery(contextAt('@2027 jan 12', 12));
      expect(match).toEqual({ from: 0, query: '2027 jan 12' });
    });
  });

  /**
   * Regression coverage for the coordinate-space bug found via live
   * instrumentation: `scanDate(text, offset)`'s returned `end` is already
   * an index into `text` itself (it's computed as `offset + 1 +
   * match.length`) — since `dateTrigger.ts` passes the *un-sliced*
   * `textBeforeCursor` with `offset = atIndex`, `closedDate.end` already
   * lands directly in `textBeforeCursor`'s coordinate space. The bug was
   * comparing `textBeforeCursor.length > atIndex + closedDate.end` —
   * double-counting `atIndex` — which only diverges from the correct
   * `textBeforeCursor.length > closedDate.end` when `atIndex > 0`, i.e.
   * when the closed Date is not the first thing on the line. Every case
   * above happens to have its Date start at column 0, which is exactly
   * why none of them caught this.
   */
  describe('a closed Date preceded by other text on the same line (atIndex > 0)', () => {
    it('a single closed Date preceded by plain text still terminates on a trailing space', () => {
      const match = extractDateTriggerQuery(contextAt('Meet @2026-08-20 ', 17));
      expect(match).toBeNull();
    });

    it('a closed Date preceded by one earlier closed Date on the same line terminates on a trailing space', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-21 @2026-08-22 ', 24));
      expect(match).toBeNull();
    });

    it('exact browser repro: three closed Dates on one line, trailing space after the last one', () => {
      const match = extractDateTriggerQuery(
        contextAt('@2026-08-24 @2026-08-21 @2026-08-22 ', 36)
      );
      expect(match).toBeNull();
    });

    it('a still-composing (non-closed) Date preceded by an earlier closed Date stays active across its own trailing space', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20 @12 ', 16));
      expect(match).toEqual({ from: 12, query: '12 ' });
    });

    it('a multi-word expression preceded by an earlier closed Date still resolves and stays active', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20 @12 mar', 19));
      expect(match).toEqual({ from: 12, query: '12 mar' });
    });

    it('the closed Date preceded by other text still matches with no trailing content (echo-back case)', () => {
      const match = extractDateTriggerQuery(contextAt('@2026-08-20 @2026-08-22', 23));
      expect(match).toEqual({ from: 12, query: '2026-08-22' });
    });
  });
});
