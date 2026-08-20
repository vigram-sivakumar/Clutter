import type { EditorState } from '@codemirror/state';

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
