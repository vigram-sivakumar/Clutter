import { deleteCharBackward } from '@codemirror/commands';
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  deleteBulletMarkerSeparator,
  deleteCompleteListItemSelection,
  deleteTaskMarker,
  markdownEnterCommand,
} from './markdownEnterKeymap';

/**
 * Regression suite for the follow-up fix (2026-08-31): task Backspace at
 * genuine content-start (`- [ ] |Task`, right after the checkbox's own
 * separator) previously fell through, uncovered, to upstream
 * `deleteMarkupBackward`'s own uniform one-press "remove the whole
 * list-item prefix" behavior — reaching bare content in *one* press,
 * while plain bullet/ordered items (intercepted first by
 * `deleteBulletMarkerSeparator`, a deliberate, narrower, already-locked
 * product decision) take two-to-three presses to reach the same place.
 * `deleteTaskMarker` now intercepts this position too, removing only the
 * checkbox (one extra structural level, exactly matching the granularity
 * `deleteBulletMarkerSeparator` already established) and leaving the
 * outer bullet/ordered marker for the *unmodified* existing cascade to
 * finish — so task Backspace now takes exactly one more press than the
 * equivalent bullet/ordered item, never a different rule.
 *
 * Same `|`-marker fixture convention as `markdownBulletBackspace.test.ts`.
 */
function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension()],
  });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

function render(state: EditorState): string {
  const pos = state.selection.main.head;
  const text = state.doc.toString();
  return (text.slice(0, pos) + '|' + text.slice(pos)).replace(/ (?=\n|$)/g, '_');
}

function asView(target: { state: EditorState; dispatch: (tr: Transaction) => void }): EditorView {
  return target as unknown as EditorView;
}

type Handler =
  | 'deleteBulletMarkerSeparator'
  | 'deleteTaskMarker'
  | 'deleteCompleteListItemSelection'
  | 'deleteMarkupBackward'
  | 'deleteCharBackward'
  | 'none';

/** One Backspace press through the exact real chain wired in `markdownEnterKeymap()`, plus the real editor's own lower-precedence `defaultKeymap` fallback — also reports which command actually claimed the press. */
function pressBackspaceWithHandler(state: EditorState): { state: EditorState; handledBy: Handler } {
  let dispatched: Transaction | null = null;
  const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  let handledBy: Handler;
  if (deleteBulletMarkerSeparator(target)) {
    handledBy = 'deleteBulletMarkerSeparator';
  } else if (deleteTaskMarker(target)) {
    handledBy = 'deleteTaskMarker';
  } else if (deleteCompleteListItemSelection(target)) {
    handledBy = 'deleteCompleteListItemSelection';
  } else if (deleteMarkupBackward(target)) {
    handledBy = 'deleteMarkupBackward';
  } else if (deleteCharBackward(asView(target))) {
    handledBy = 'deleteCharBackward';
  } else {
    handledBy = 'none';
  }
  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return { state: next, handledBy };
}

/** One Backspace press through the exact real chain wired in `markdownEnterKeymap()`, plus the real editor's own lower-precedence `defaultKeymap` fallback. */
function pressBackspace(state: EditorState): EditorState {
  return pressBackspaceWithHandler(state).state;
}

/** Presses Backspace repeatedly and records every intermediate rendered state, stopping once a press produces no change (fixed point). */
function cascade(source: string, maxPresses = 6): string[] {
  let state = parse(source);
  const steps = [render(state)];
  for (let i = 0; i < maxPresses; i++) {
    const next = pressBackspace(state);
    const rendered = render(next);
    if (rendered === steps[steps.length - 1]) {
      break;
    }
    steps.push(rendered);
    state = next;
  }
  return steps;
}

const MALFORMED_FRAGMENT = /\[\s?x?\s?\]?$|\[$|\]$/i;

describe('Backspace content-start consistency: bullet vs. ordered vs. task', () => {
  it('bullet: "- |Task" reaches bare content in exactly 2 presses, matching the established cascade', () => {
    expect(cascade('- |Task')).toEqual(['- |Task', '-|Task', '|Task']);
  });

  it('ordered: "1. |Task" reaches bare content in exactly 3 presses, matching the established cascade', () => {
    expect(cascade('1. |Task')).toEqual(['1. |Task', '1.|Task', '1|Task', '|Task']);
  });

  it('unchecked task: "- [ ] |Task" reaches bare content in exactly 3 presses — one more than bullet, for the one extra structural level (the checkbox) — then follows the identical, unmodified bullet cascade', () => {
    expect(cascade('- [ ] |Task')).toEqual(['- [ ] |Task', '- |Task', '-|Task', '|Task']);
  });

  it('checked task: "- [x] |Task" reaches bare content in exactly 3 presses, identically to unchecked — the checked state is discarded along with the whole checkbox, never carried onto the surviving bullet', () => {
    expect(cascade('- [x] |Task')).toEqual(['- [x] |Task', '- |Task', '-|Task', '|Task']);
  });

  it('ordered task: "1. [ ] |Task" reaches bare content in exactly 4 presses — one more than plain ordered — then follows the identical, unmodified ordered cascade', () => {
    expect(cascade('1. [ ] |Task')).toEqual(['1. [ ] |Task', '1. |Task', '1.|Task', '1|Task', '|Task']);
  });

  it('no intermediate state, for any construct, is ever a malformed checkbox fragment ("[", "]", "[]", "[ ", " ]")', () => {
    for (const source of ['- |Task', '1. |Task', '- [ ] |Task', '- [x] |Task', '1. [ ] |Task']) {
      for (const step of cascade(source)) {
        expect(step).not.toMatch(MALFORMED_FRAGMENT);
      }
    }
  });

  it('the final state for every construct is identical bare content with the caret at absolute start', () => {
    for (const source of ['- |Task', '1. |Task', '- [ ] |Task', '- [x] |Task', '1. [ ] |Task']) {
      const steps = cascade(source);
      expect(steps[steps.length - 1]).toBe('|Task');
    }
  });

  it('empty task Backspace is unaffected — still exits in a single press, matching the pre-existing symmetric bullet rule', () => {
    expect(cascade('- [ ] |', 2)).toEqual(['- [ ] |', '|']);
  });
});

/**
 * Regression suite for the second follow-up fix (2026-08-31): an empty
 * task item *after* a sibling (`"- [ ] A\n- [ ] |"`) left six stray
 * indentation spaces behind on Backspace (`"- [ ] A\n      |"`) instead
 * of the clean blank line Enter already produces for the identical
 * shape (`"- [ ] A\n|"`). Root cause: `deleteBulletMarkerSeparator`'s
 * own "is this item empty" check was `content === null` — true for an
 * ordinary bullet/ordered empty item (no content sibling at all exists),
 * but never true for a task, since a task item's `content` is always the
 * `Task` node, even when the checkbox has no real text after it. That
 * left this exact position uncovered by both `deleteBulletMarkerSeparator`
 * and `deleteTaskMarker`, falling through to upstream
 * `deleteMarkupBackward`'s own quirky "blank a later item's marker to
 * matching-width spaces" behavior — the same quirk this file's own
 * `deleteBulletMarkerSeparator` doc comment already documents replacing
 * for every other case.
 *
 * Fix: `isEmptyTask` (in `deleteBulletMarkerSeparator` itself) recognizes
 * a task whose own content is empty as equivalent to the existing
 * `content === null` case — same branch, same removal shape
 * (`marker.from` to `line.to`), not a new task-specific rule.
 */
describe('Empty task item after a sibling: Backspace now matches Enter (2026-08-31 fix)', () => {
  it('REGRESSION (the exact reported bug): "- [ ] A\\n- [ ] |" Backspace -> "- [ ] A\\n|", no stale indentation, caret at line start', () => {
    const { state, handledBy } = pressBackspaceWithHandler(parse('- [ ] A\n- [ ] |'));
    // Assert the actual document text and caret offset directly, not the
    // `_`-substituted render() convention, per the explicit requirement
    // to check real text/position rather than rendered appearance.
    expect(state.doc.toString()).toBe('- [ ] A\n');
    expect(state.selection.main.head).toBe(state.doc.toString().length);
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
  });

  it('matches Enter\'s own result for the identical shape, byte for byte', () => {
    const backspaceResult = pressBackspace(parse('- [ ] A\n- [ ] |'));
    let dispatched: Transaction | null = null;
    markdownEnterCommand({
      state: parse('- [ ] A\n- [ ] |'),
      dispatch: (tr) => {
        dispatched = tr;
      },
    });
    const enterResult = dispatched ? (dispatched as Transaction).state : parse('- [ ] A\n- [ ] |');
    expect(backspaceResult.doc.toString()).toBe(enterResult.doc.toString());
    expect(backspaceResult.selection.main.head).toBe(enterResult.selection.main.head);
  });

  it('checked task after a sibling: identical fix applies, checked state discarded along with the empty item', () => {
    const { state, handledBy } = pressBackspaceWithHandler(parse('- [x] A\n- [x] |'));
    expect(state.doc.toString()).toBe('- [x] A\n');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
  });

  it('standalone/first empty task is unchanged by this fix — same clean result as before, just via deleteBulletMarkerSeparator\'s own empty-item branch instead of deleteMarkupBackward\'s fallback', () => {
    const { state } = pressBackspaceWithHandler(parse('- [ ] |'));
    expect(state.doc.toString()).toBe('');
    expect(state.selection.main.head).toBe(0);
  });

  it('checked standalone empty task: same clean result', () => {
    const { state } = pressBackspaceWithHandler(parse('- [x] |'));
    expect(state.doc.toString()).toBe('');
  });

  it('ordered empty task after a sibling: closes the numbering gap, exactly like a plain empty ordered item', () => {
    const { state } = pressBackspaceWithHandler(parse('1. [ ] A\n2. [ ] |\n3. [ ] C'));
    expect(state.doc.toString()).toBe('1. [ ] A\n\n2. [ ] C');
  });

  it('nested empty task is NOT changed by this fix — byte-identical result to the pre-fix behavior (a pre-existing, general, out-of-scope list-editing limitation, confirmed identical for plain bullets)', () => {
    const beforeFix = '  - [ ] Parent\n    |'; // known pre-fix result, independently confirmed against an unmodified deleteMarkupBackward
    const { state } = pressBackspaceWithHandler(parse('  - [ ] Parent\n    - [ ] |'));
    expect(render(state)).toBe(beforeFix);
  });

  it('ordinary bullet Backspace (no task involved) is completely unchanged', () => {
    const { state, handledBy } = pressBackspaceWithHandler(parse('- A\n- |'));
    expect(state.doc.toString()).toBe('- A\n');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
  });

  it('ordinary ordered Backspace (no task involved) is completely unchanged', () => {
    const { state, handledBy } = pressBackspaceWithHandler(parse('1. A\n2. |'));
    expect(state.doc.toString()).toBe('1. A\n');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
  });

  it('the already-fixed content-start cascade (non-empty tasks) is unaffected by this fix', () => {
    expect(cascade('- [ ] |Task')).toEqual(['- [ ] |Task', '- |Task', '-|Task', '|Task']);
    expect(cascade('- [x] |Task')).toEqual(['- [x] |Task', '- |Task', '-|Task', '|Task']);
    expect(cascade('1. [ ] |Task')).toEqual(['1. [ ] |Task', '1. |Task', '1.|Task', '1|Task', '|Task']);
  });
});

describe('Enter at the same task content-start boundary remains consistent (regression check, not re-derived)', () => {
  function pressEnter(state: EditorState): EditorState {
    let dispatched: Transaction | null = null;
    markdownEnterCommand({ state, dispatch: (tr) => { dispatched = tr; } });
    const next = dispatched ? (dispatched as Transaction).state : state;
    ensureSyntaxTree(next, next.doc.length, 5000);
    return next;
  }

  it('"- [ ] |Task" Enter still splits into two valid tasks (unaffected by the Backspace fix)', () => {
    const next = pressEnter(parse('- [ ] |Task'));
    expect(render(next)).toBe('- [ ]_\n- [ ] |Task');
  });

  it('"- [x] |Task" Enter still keeps the checked box on line one and a fresh unchecked box on line two', () => {
    const next = pressEnter(parse('- [x] |Task'));
    expect(render(next)).toBe('- [x]_\n- [ ] |Task');
  });
});

describe('Arrow-navigation/atomic caret behavior is unaffected by the Backspace fix (structural check, not rendering)', () => {
  it('the TaskMarker node itself is untouched by this fix — same 3-character range, same tree shape', () => {
    const state = parse('- [ ] Task');
    let taskMarker: { from: number; to: number } | null = null;
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.name === 'TaskMarker') {
          taskMarker = { from: node.from, to: node.to };
        }
      },
    });
    expect(taskMarker).toEqual({ from: 2, to: 5 });
    expect(state.sliceDoc(2, 5)).toBe('[ ]');
  });
});
