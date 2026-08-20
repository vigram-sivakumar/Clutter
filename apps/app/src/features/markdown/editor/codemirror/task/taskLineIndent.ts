import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import { isTaskMarkerNode } from './taskEngagement';

const taskLineMark = Decoration.line({ class: 'cm-task-line' });

/**
 * Reserves a hanging-indent column (`.cm-task-line`, styled in
 * MarkdownEditor.css) on every physical document line that contains a
 * `TaskMarker`, so a long task's wrapped continuation text aligns under
 * the task's own text rather than falling back to the editor's left edge.
 *
 * This is a block-level (`Decoration.line`) concern, not an inline one —
 * `TaskCheckboxWidget`/`taskCheckboxDecorations.ts` only ever replace the
 * inline `TaskMarker` range, which (like any inline element) cannot
 * reserve space for a browser-soft-wrapped continuation of the same line;
 * only a line decoration's `padding-left` can. See `taskLineIndent.ts`'s
 * sibling CSS rule for the actual hanging-indent mechanics
 * (`padding-left` + negative `text-indent`, so only the line's own first
 * visual row is pulled back and wrapped rows keep the reserved column).
 *
 * Deliberately unconditional — not gated on `isTokenEngaged` the way
 * `TaskCheckboxWidget`'s own rendering is. The reserved column must stay
 * constant whether or not the checkbox is currently engaged, or clicking
 * into the raw `[ ]` text to edit it would visibly shift the whole line's
 * layout. Every `Task` node independently produces its own line's own
 * decoration, so nested/ordered/bullet task lists each reserve exactly
 * their own column with no special-casing.
 */
function buildTaskLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isTaskMarkerNode(node.name)) {
          return;
        }

        const line = view.state.doc.lineAt(node.from);
        if (seenLines.has(line.from)) {
          return;
        }
        seenLines.add(line.from);

        builder.add(line.from, line.from, taskLineMark);
      },
    });
  }

  return builder.finish();
}

interface TaskLineIndentPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function taskLineIndent(): Extension {
  return ViewPlugin.fromClass<TaskLineIndentPlugin>(
    class implements TaskLineIndentPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildTaskLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildTaskLineDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
