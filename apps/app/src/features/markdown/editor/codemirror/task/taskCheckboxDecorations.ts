import type { Extension } from '@codemirror/state';
import type { EditorView, WidgetType } from '@codemirror/view';

import { semanticTokenDecorations } from '../semanticToken/tokenDecorations';
import { TaskCheckboxWidget } from './TaskCheckboxWidget';
import { isTaskMarkerChecked, isTaskMarkerNode, type TaskMarkerNodeRange } from './taskEngagement';

function renderTaskCheckbox(
  _view: EditorView,
  _node: TaskMarkerNodeRange,
  raw: string
): WidgetType | null {
  return new TaskCheckboxWidget(isTaskMarkerChecked(raw));
}

/**
 * Renders every `TaskMarker` as an interactive checkbox widget and marks
 * it atomic — a thin Task-specific adapter over the generic
 * `semanticToken/tokenDecorations.ts` mechanism, mirroring
 * `dateDecorations.ts`. No resolver dependency, unlike Date/WikiLink/Tag:
 * a checkbox's own raw text is the entire fact needed to render it.
 *
 * `alwaysAtRest: true` — unlike Date/WikiLink/Tag, a task checkbox never
 * reveals its raw `[ ]`/`[x]` text on cursor/line engagement; it falls
 * back to plain text only once the syntax tree itself stops recognizing a
 * `TaskMarker` there (the source no longer parses as one). Toggling still
 * works uninterrupted — `taskCheckboxActivation.ts` dispatches directly
 * against the document position, never depends on the raw text being
 * visible first.
 */
export function taskCheckboxDecorations(): Extension {
  return semanticTokenDecorations(isTaskMarkerNode, renderTaskCheckbox, { alwaysAtRest: true });
}
