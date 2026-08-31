import { deleteCharBackward } from '@codemirror/commands';
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  deleteBulletMarkerSeparator,
  deleteCompleteListItemSelection,
  deleteTaskMarker,
  markdownEnterCommand,
} from './markdownEnterKeymap';

/**
 * Same `|`-marker fixture convention as `markdownEnterKeymap.test.ts` /
 * `markdownBulletBackspace.test.ts`: `|` marks the cursor, `_` stands for
 * a trailing space that would otherwise be invisible/stripped in a
 * fixture literal.
 */
function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const pos = doc.indexOf('|');
  const text = pos >= 0 ? doc.slice(0, pos) + doc.slice(pos + 1) : doc;
  const state = EditorState.create({
    doc: text,
    selection: pos >= 0 ? EditorSelection.cursor(pos) : undefined,
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

/**
 * The parsed `{ListItem, ListMark, Task, TaskMarker}` shape (or its
 * absence) at a given document offset — the structural fact every
 * "surprising case" in this suite asserts on, per the investigation's own
 * standing instruction to inspect the real tree rather than trust
 * rendered text. Returns `'no-list-item'`, `'no-task'` (a `ListItem`
 * whose content is plain `Paragraph`, e.g. a degraded/malformed
 * checkbox), or the real `{ checked, raw }` facts read off a genuine
 * `TaskMarker`.
 */
function taskShapeAt(
  state: EditorState,
  pos: number
): 'no-list-item' | 'no-task' | { checked: boolean; raw: string } {
  let listItem: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      listItem = node;
      break;
    }
  }
  if (!listItem) {
    return 'no-list-item';
  }
  const marker = listItem.firstChild;
  const taskNode = marker?.nextSibling;
  if (!taskNode || taskNode.name !== 'Task') {
    return 'no-task';
  }
  const taskMarker = taskNode.firstChild;
  if (!taskMarker || taskMarker.name !== 'TaskMarker') {
    return 'no-task';
  }
  const raw = state.sliceDoc(taskMarker.from, taskMarker.to);
  return { checked: raw[1]?.toLowerCase() === 'x', raw };
}

function dumpTree(state: EditorState): string {
  const lines: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      lines.push(`${node.name}[${node.from},${node.to}) ${JSON.stringify(state.doc.sliceString(node.from, node.to))}`);
    },
  });
  return lines.join(' | ');
}

type Handler = 'markdown' | 'default';

function pressEnter(state: EditorState): { state: EditorState; handledBy: Handler } {
  let dispatched: Transaction | null = null;
  const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };
  const handledBy: Handler = markdownEnterCommand(target) ? 'markdown' : 'default';
  const next = dispatched ? (dispatched as Transaction).state : state;
  ensureSyntaxTree(next, next.doc.length, 5000);
  return { state: next, handledBy };
}

/**
 * `deleteCharBackward` is a `Command` (takes a full `EditorView`), unlike
 * every Clutter/CM6-Markdown command in this chain (`StateCommand`s,
 * `{state, dispatch}`) — this cast is test-only plumbing to exercise the
 * *real* end-of-chain fallback (`defaultKeymap`'s own Backspace binding,
 * lower precedence than `markdownEnterKeymap()`) a plain `{state,
 * dispatch}` target can't type-check against; the command only ever
 * touches `.state`/`.dispatch` at runtime, which this target genuinely
 * has. Mirrors `markdownBulletBackspace.test.ts`'s own identical helper.
 */
function asView(target: { state: EditorState; dispatch: (tr: Transaction) => void }): EditorView {
  return target as unknown as EditorView;
}

/** Mirrors the real Backspace chain wired in `markdownEnterKeymap()`, plus the real editor's own lower-precedence `defaultKeymap` fallback for whatever none of those four claim. */
function pressBackspace(state: EditorState): { state: EditorState; handledBy: string } {
  let dispatched: Transaction | null = null;
  const target = { state, dispatch: (tr: Transaction) => { dispatched = tr; } };

  let handledBy: string;
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

function enter(source: string) {
  const result = pressEnter(parse(source));
  return { rendered: render(result.state), handledBy: result.handledBy, state: result.state };
}

function backspace(source: string) {
  const result = pressBackspace(parse(source));
  return { rendered: render(result.state), handledBy: result.handledBy, state: result.state };
}

describe('Enter at a task checkbox boundary', () => {
  it('content-start, unchecked: "- [ ] |Task" splits into two valid tasks, new one always unchecked', () => {
    const { rendered, state } = enter('- [ ] |Task');
    expect(rendered).toBe('- [ ]_\n- [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('content-start, checked: "- [x] |Task" keeps the original checked (now empty) task, new item is always unchecked (Decision B)', () => {
    const { rendered, state } = enter('- [x] |Task');
    expect(rendered).toBe('- [x]_\n- [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: true, raw: '[x]' });
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('repeated Enter from the newly-created task never duplicates/corrupts (idempotent, unlike the fixed ordered-list literal-marker bug)', () => {
    const first = enter('- [x] |Task');
    expect(first.rendered).toBe('- [x]_\n- [ ] |Task');
    // Press Enter again at the same content-start shape on the freshly created line.
    const secondResult = pressEnter(first.state);
    ensureSyntaxTree(secondResult.state, secondResult.state.doc.length, 5000);
    expect(render(secondResult.state)).toBe('- [x]_\n- [ ]_\n- [ ] |Task');
    expect(taskShapeAt(secondResult.state, secondResult.state.doc.line(3).from)).toEqual({
      checked: false,
      raw: '[ ]',
    });
  });

  it('mid-word split leaves ordinary text splitting untouched: "- [ ] Ta|sk"', () => {
    const { rendered, state } = enter('- [ ] Ta|sk');
    expect(rendered).toBe('- [ ] Ta\n- [ ] |sk');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('end-of-line (already-correct upstream behavior, preserved): "- [ ] Task|"', () => {
    const { rendered, state } = enter('- [ ] Task|');
    expect(rendered).toBe('- [ ] Task\n- [ ] |');
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('empty task exits the list (already-established behavior, preserved): "- [ ] |"', () => {
    const { rendered, handledBy } = enter('- [ ] |');
    expect(handledBy).toBe('markdown');
    expect(rendered).toBe('|');
  });

  it('inside the checkbox never splits it: "- [x|] Task" (right after the state char)', () => {
    const { rendered, state } = enter('- [x|] Task');
    expect(rendered).toBe('- [x]_\n- [ ] |Task');
    expect(dumpTree(state)).not.toMatch(/Paragraph\[[^)]*\) "\["/);
    expect(dumpTree(state)).not.toMatch(/Paragraph\[[^)]*\) "\]/);
  });

  it('inside the checkbox never splits it: "- [| ] Task" (right after the opening bracket)', () => {
    const { rendered, state } = enter('- [| ] Task');
    expect(rendered).toBe('- [ ]_\n- [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('right before the closing bracket: "- [ |] Task"', () => {
    const { rendered, state } = enter('- [ |] Task');
    expect(rendered).toBe('- [ ]_\n- [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('malformed checkbox "- [] |Task" (no state char — never a real Task node) is untouched by task logic', () => {
    const before = parse('- [] |Task');
    expect(taskShapeAt(before, 0)).toBe('no-task');
    const { state } = enter('- [] |Task');
    // Still no Task node anywhere — ordinary paragraph split, not task-aware.
    expect(dumpTree(state)).not.toContain('TaskMarker');
  });

  it('malformed checkbox "- [ ]|Task" (no separator — never a real Task node) is untouched by task logic', () => {
    const before = parse('- [ ]|Task');
    expect(taskShapeAt(before, 0)).toBe('no-task');
    const { state } = enter('- [ ]|Task');
    expect(dumpTree(state)).not.toContain('TaskMarker');
  });

  it('bullet variant "*"', () => {
    const { rendered, state } = enter('* [ ] |Task');
    expect(rendered).toBe('* [ ]_\n* [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('bullet variant "+"', () => {
    const { rendered, state } = enter('+ [ ] |Task');
    expect(rendered).toBe('+ [ ]_\n+ [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('ordered task list renumbers the tail exactly like plain ordered lists: "1. [ ] |Task"', () => {
    const { rendered, state } = enter('1. [ ] |Task');
    expect(rendered).toBe('1. [ ]_\n2. [ ] |Task');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('ordered task list, checked, mid-list: renumbers subsequent siblings', () => {
    const { rendered, state } = enter('1. [ ] A\n2. [x] |Task\n3. [ ] C');
    expect(rendered).toBe('1. [ ] A\n2. [x]_\n3. [ ] |Task\n4. [ ] C');
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: true, raw: '[x]' });
    expect(taskShapeAt(state, state.doc.line(3).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('nested task item content-start split', () => {
    const { rendered, state } = enter('- [ ] Parent\n  - [ ] |Child');
    expect(rendered).toBe('- [ ] Parent\n  - [ ]_\n  - [ ] |Child');
    expect(taskShapeAt(state, state.doc.line(2).from)).toEqual({ checked: false, raw: '[ ]' });
    expect(taskShapeAt(state, state.doc.line(3).from)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('mixed structure: bullet item, then task sibling — unaffected by task logic', () => {
    const { rendered } = enter('- Bullet|\n- [ ] Task');
    expect(rendered).toBe('- Bullet\n- |\n- [ ] Task');
  });

  it('mixed structure: task item, then ordinary bullet sibling — task split unaffected by bullet content', () => {
    const { rendered, state } = enter('- [ ] |Task\n- Bullet');
    expect(rendered).toBe('- [ ]_\n- [ ] |Task\n- Bullet');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });
});

describe('Backspace at a task checkbox boundary', () => {
  it('immediately before TaskMarker stays owned by deleteBulletMarkerSeparator (the outer marker boundary, unchanged)', () => {
    const { rendered, handledBy } = backspace('- |[ ] Task');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
    expect(rendered).toBe('-|[ ] Task');
  });

  it('immediately after TaskMarker atomically removes the whole checkbox+separator: "- [ ]| Task" -> "- |Task"', () => {
    const { rendered, handledBy, state } = backspace('- [ ]| Task');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- |Task');
    expect(taskShapeAt(state, 0)).toBe('no-task');
  });

  it('inside "[ ]" (between "[" and the state char): "- [| ] Task" -> "- |Task"', () => {
    const { rendered, handledBy, state } = backspace('- [| ] Task');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- |Task');
    expect(taskShapeAt(state, 0)).toBe('no-task');
  });

  it('inside "[x]" (between the state char and "]"): "- [x|] Task" -> "- |Task"', () => {
    const { rendered, handledBy, state } = backspace('- [x|] Task');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- |Task');
    expect(taskShapeAt(state, 0)).toBe('no-task');
  });

  it('before "]": "- [ |] Task" -> "- |Task"', () => {
    const { rendered, handledBy } = backspace('- [ |] Task');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- |Task');
  });

  it('after "]" on a checked task: "- [x]| Task" -> "- |Task" (checked state discarded along with the whole checkbox, not carried onto plain text)', () => {
    const { rendered, handledBy, state } = backspace('- [x]| Task');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- |Task');
    expect(taskShapeAt(state, 0)).toBe('no-task');
  });

  it('empty task, cursor after the trailing separator: "- [ ] |" exits the list in one press — same text result as before the 2026-08-31 empty-task fix, now via deleteBulletMarkerSeparator\'s own empty-item branch instead of falling through to deleteMarkupBackward (see markdownTaskBackspaceConsistency.test.ts for the case this fix actually targets)', () => {
    const { rendered, handledBy } = backspace('- [ ] |');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
    expect(rendered).toBe('|');
  });

  it('normal task text (not at the checkbox at all) is untouched — falls to plain default char deletion, unaffected by this change', () => {
    const { handledBy, rendered } = backspace('- [ ] Ta|sk');
    expect(handledBy).toBe('deleteCharBackward');
    expect(rendered).toBe('- [ ] T|sk');
  });

  it('task inside a nested list: same checkbox-atomic rule applies at any depth', () => {
    const { rendered, handledBy, state } = backspace('- Parent\n  - [x]| Child');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('- Parent\n  - |Child');
    expect(taskShapeAt(state, state.doc.line(2).from)).toBe('no-task');
  });

  it('ordered task item: checkbox removal never touches numbering', () => {
    const { rendered, handledBy, state } = backspace('1. [ ] A\n2. [x]| B\n3. [ ] C');
    expect(handledBy).toBe('deleteTaskMarker');
    expect(rendered).toBe('1. [ ] A\n2. |B\n3. [ ] C');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
    expect(taskShapeAt(state, state.doc.line(3).from)).toEqual({ checked: false, raw: '[ ]' });
  });
});

describe('Selection deletion around a task checkbox', () => {
  it('selecting the entire TaskMarker ("[ ]") deletes cleanly via plain range deletion, no malformed fragment', () => {
    const doc = '- [ ] Task';
    const from = doc.indexOf('[');
    const to = doc.indexOf(']') + 1;
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to), extensions: [markdownLanguageExtension()] });
    ensureSyntaxTree(state, doc.length, 5000);
    const pressed = pressBackspace(state);
    // Selection covers only "[ ]" (3 chars), not its own trailing separator — the space before "Task" survives.
    expect(render(pressed.state)).toBe('- | Task');
    expect(taskShapeAt(pressed.state, 0)).toBe('no-task');
  });

  it('selecting "[ ] " including its own separator deletes cleanly', () => {
    const doc = '- [ ] Task';
    const from = doc.indexOf('[');
    const to = doc.indexOf('Task');
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to), extensions: [markdownLanguageExtension()] });
    ensureSyntaxTree(state, doc.length, 5000);
    const pressed = pressBackspace(state);
    expect(render(pressed.state)).toBe('- |Task');
    expect(taskShapeAt(pressed.state, 0)).toBe('no-task');
  });

  it('selecting task text only leaves the checkbox intact', () => {
    const doc = '- [ ] Task';
    const from = doc.indexOf('Task');
    const to = doc.length;
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to), extensions: [markdownLanguageExtension()] });
    ensureSyntaxTree(state, doc.length, 5000);
    const pressed = pressBackspace(state);
    expect(render(pressed.state)).toBe('- [ ] |');
    expect(taskShapeAt(pressed.state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('selecting the complete ListItem deletes the whole task item', () => {
    const doc = '- [ ] A\n- [ ] B\n- [ ] C';
    const from = doc.indexOf('- [ ] B');
    const to = from + '- [ ] B'.length + 1;
    const state = EditorState.create({ doc, selection: EditorSelection.range(from, to), extensions: [markdownLanguageExtension()] });
    ensureSyntaxTree(state, doc.length, 5000);
    const pressed = pressBackspace(state);
    expect(pressed.handledBy).toBe('deleteCompleteListItemSelection');
    expect(render(pressed.state)).toBe('- [ ] A\n|- [ ] C');
  });
});

describe('Task structural state', () => {
  it('checked vs unchecked are both recognized identically for structural purposes', () => {
    expect(taskShapeAt(parse('- [ ] Task'), 0)).toEqual({ checked: false, raw: '[ ]' });
    expect(taskShapeAt(parse('- [x] Task'), 0)).toEqual({ checked: true, raw: '[x]' });
    expect(taskShapeAt(parse('- [X] Task'), 0)).toEqual({ checked: true, raw: '[X]' });
  });

  it('malformed checkbox syntax never parses as Task', () => {
    expect(taskShapeAt(parse('- [ ]Task'), 0)).toBe('no-task');
    expect(taskShapeAt(parse('- []  Task'), 0)).toBe('no-task');
    expect(taskShapeAt(parse('- [ ]'), 0)).toBe('no-task');
    expect(taskShapeAt(parse('- [q] Task'), 0)).toBe('no-task');
  });

  it('task -> bullet: deleting the checkbox demotes a task item to a plain bullet item', () => {
    const { state } = backspace('- [ ]| Task');
    expect(dumpTree(state)).toContain('Paragraph');
    expect(taskShapeAt(state, 0)).toBe('no-task');
  });

  it('bullet -> task: a plain bullet item is unaffected by task commands (no TaskMarker to find)', () => {
    const before = parse('- |Text');
    expect(taskShapeAt(before, 0)).toBe('no-task');
    const { handledBy, rendered } = backspace('- |Text');
    expect(handledBy).toBe('deleteBulletMarkerSeparator');
    expect(rendered).toBe('-|Text');
  });

  it('ordered task numbering is preserved end-to-end across a content-start split', () => {
    const { rendered } = enter('1. [ ] A\n2. [ ] |B\n3. [ ] C');
    expect(rendered).toBe('1. [ ] A\n2. [ ]_\n3. [ ] |B\n4. [ ] C');
  });

  it('nested task structure survives a checkbox-boundary Backspace one level down', () => {
    const { rendered, state } = backspace('- [ ] Parent\n  - [x]| Child');
    expect(rendered).toBe('- [ ] Parent\n  - |Child');
    expect(taskShapeAt(state, 0)).toEqual({ checked: false, raw: '[ ]' });
  });

  it('undo/redo atomicity: one Enter gesture is one transaction (single changes array, single dispatch)', () => {
    let dispatchCount = 0;
    const state = parse('1. [x] |Task\n2. [ ] B');
    markdownEnterCommand({
      state,
      dispatch: () => {
        dispatchCount++;
      },
    });
    expect(dispatchCount).toBe(1);
  });

  it('undo/redo atomicity: one Backspace gesture is one transaction', () => {
    let dispatchCount = 0;
    const state = parse('- [x]| Task');
    deleteTaskMarker({
      state,
      dispatch: () => {
        dispatchCount++;
      },
    });
    expect(dispatchCount).toBe(1);
  });
});
