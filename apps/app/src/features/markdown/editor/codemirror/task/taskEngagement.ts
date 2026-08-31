import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import {
  findAtRestTokenAt,
  findTokenAt,
  type TokenNodeRange,
} from '../semanticToken/tokenEngagement';

export type TaskMarkerNodeRange = TokenNodeRange;

/** The one Task-specific fact the generic semantic-token mechanisms need: which Lezer node names count as a task checkbox marker. */
export const isTaskMarkerNode = (nodeName: string): boolean => nodeName === 'TaskMarker';

export function findTaskMarkerAt(state: EditorState, pos: number): TaskMarkerNodeRange | null {
  return findTokenAt(state, pos, isTaskMarkerNode);
}

/** Same as {@link findTaskMarkerAt}, but only returns a node that is currently at rest (not engaged). */
export function findAtRestTaskMarkerAt(
  state: EditorState,
  pos: number
): TaskMarkerNodeRange | null {
  return findAtRestTokenAt(state, pos, isTaskMarkerNode);
}

/**
 * `TaskMarker` is always exactly 3 characters — `[`, one state character,
 * `]` — confirmed directly against the installed `@lezer/markdown@1.7.2`'s
 * `TaskList` extension. Read leniently (`x` or `X`, matching
 * `TaskExtractor.ts`'s own `TASK_LINE_PATTERN`), so an existing `[X]` in a
 * vault is recognized as checked without ever being rewritten just because
 * it was read (docs/editor-architecture-decisions.md's "lenient reader,
 * strict writer").
 */
export function isTaskMarkerChecked(raw: string): boolean {
  return raw[1]?.toLowerCase() === 'x';
}

/**
 * The `TaskMarker` child of a `ListItem`, if it has one — `ListItem`'s
 * `firstChild` is `ListMark`, and a task item's `ListMark.nextSibling` is
 * a `Task` node whose own `firstChild` is `TaskMarker` (confirmed against
 * the installed `@lezer/markdown@1.7.2` grammar, which registers
 * `TaskList` in `markdownGrammarExtensions.ts`: `ListItem[ListMark,
 * Task[TaskMarker, ...raw content...]]`, identical shape for bullet and
 * ordered markers alike). Returns `null` for every other `ListItem` shape
 * (plain paragraph content, or a malformed `[ ]`/`[x]` the parser never
 * recognized as `TaskMarker` at all).
 *
 * Moved here (2026-08-31, task visual-rendering slice) from its original
 * home in `enter/markdownEnterKeymap.ts` — this file is the designated
 * shared owner of "which node is a task's checkbox" facts
 * (`isTaskMarkerNode`/`findTaskMarkerAt`/`isTaskMarkerChecked` already
 * live here), and the new checkbox-decoration ViewPlugin needs the exact
 * same structural walk the Enter/Backspace commands already established,
 * not a second, independently-maintained copy of it — both call sites
 * import this one definition, logic unchanged.
 */
export function taskMarkerOfListItem(listItem: SyntaxNode): SyntaxNode | null {
  const marker = listItem.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return null;
  }
  const taskNode = marker.nextSibling;
  if (!taskNode || taskNode.name !== 'Task') {
    return null;
  }
  const taskMarker = taskNode.firstChild;
  return taskMarker && isTaskMarkerNode(taskMarker.name) ? taskMarker : null;
}
