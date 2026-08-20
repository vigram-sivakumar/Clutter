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
 * Renders at-rest `TaskMarker`s as an interactive checkbox widget, leaves
 * engaged ones as plain editable `[ ]`/`[x]` text, and marks at-rest
 * ranges atomic — a thin Task-specific adapter over the generic
 * `semanticToken/tokenDecorations.ts` mechanism, mirroring
 * `dateDecorations.ts`. No resolver dependency, unlike Date/WikiLink/Tag:
 * a checkbox's own raw text is the entire fact needed to render it.
 */
export function taskCheckboxDecorations(): Extension {
  return semanticTokenDecorations(isTaskMarkerNode, renderTaskCheckbox);
}
