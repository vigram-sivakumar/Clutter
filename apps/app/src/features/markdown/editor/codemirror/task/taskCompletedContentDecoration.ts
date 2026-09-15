import { syntaxTree } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import { isTaskMarkerChecked, TASK_COMPLETED_CLASS, taskMarkerOfListItem } from './taskEngagement';
import { computeListItemFold } from '../fold/listItemFoldService';

/**
 * Gives a completed task's rendered *content* (everything after the
 * checkbox) a real `cm-task-completed`-classed wrapping `Decoration.mark`,
 * replacing the old `.cm-line:has(.cm-task-checkbox[aria-checked='true'])`
 * line-level CSS rule (docs/editor-architecture-decisions.md's "Inline
 * formatting composition at the token level" — extended to editor/task
 * state, not just syntax-tree-derived `tok-*` formatting).
 *
 * **Why a real decoration is needed at all, when widget-family participants
 * (WikiLink/Tag/Date) already compose `TASK_COMPLETED_CLASS` onto
 * themselves directly** (`isNodeOnCompletedTask` in `taskEngagement.ts`,
 * consumed by `inlineLivePreviewParticipants.ts`'s `widgetReplaceRenderer`
 * and `wikiLinkLivePreview.ts`): plain, unclassed text (`- [x] Task`) has
 * no rendered element of its own to compose the class onto — it's a bare
 * text node. This mark gives it one, satisfying the same "every
 * text-painting element carries its own active state directly" rule for
 * the one case that isn't already a widget or ordinary content mark.
 * Ordinary marks (`tok-strong`/`tok-emphasis`/`tok-highlight`) do **not**
 * need `TASK_COMPLETED_CLASS` added onto themselves — they have no atomic
 * box or independent `color` of their own to escape from, so this mark's
 * ordinary CSS propagation (a plain, non-atomic ancestor, exactly like
 * `.tok-strike`'s own content mark) already reaches them correctly; only
 * the widget family needed direct composition, for the same reason
 * `collectActiveInlineClasses` exists.
 *
 * Deliberately independent of `inlineLivePreviewRegion.ts`'s shared
 * reveal-on-engagement traversal — `Task` is not, and must not become, a
 * participant there (per that file's own doc comment: task-checkbox
 * rendering is fused into block-level engagement, out of scope for the
 * inline mechanism). This is a separate, narrowly-scoped `ViewPlugin`,
 * same shape as `taskCompletionMetadataDecoration.ts`, that only ever adds
 * one non-atomic, non-concealing `Decoration.mark` — it cannot affect
 * engagement, selection, or editing behavior for anything.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'ListItem') {
          return;
        }

        const taskMarker = taskMarkerOfListItem(node.node);
        if (!taskMarker) {
          return;
        }

        const raw = view.state.sliceDoc(taskMarker.from, taskMarker.to);
        if (!isTaskMarkerChecked(raw)) {
          return;
        }

        const task = taskMarker.parent;
        if (!task) {
          return;
        }

        // **Never trust `task.to` directly** — the same lazy-continuation
        // boundary problem `listItemFoldService.ts` already found and
        // fixed for folding applies here identically: a `Task`/`ListItem`
        // node's raw `.to` can silently absorb a completely unrelated,
        // zero-indent sibling block (a following paragraph, an embed, a
        // heading) typed with no blank line before it, since CommonMark's
        // lazy-continuation rule treats that line as more content of the
        // *same* node regardless of its own indentation. Using `task.to`
        // unconditionally here reproduced exactly that bug: the completed-
        // task mark's range extended past the task's own line and wrapped
        // whatever unrelated content happened to fall inside it, which
        // CM6 then rendered as a nested `<span class="cm-task-completed">`
        // around it — including a note-embed widget's own DOM, dimming it
        // via `.cm-task-completed span`'s plain CSS inheritance even
        // though the embed is not, structurally, part of the task at all.
        //
        // `computeListItemFold` re-derives the item's genuine boundary via
        // the same physical-line indentation scan folding already
        // established (real nested content — a continuation paragraph, a
        // nested list — is indented past the marker's own column; an
        // unrelated sibling block is not), using the raw node's `.to` only
        // as an upper bound. It returns `null` when there is no genuine
        // *further* descendant past the marker's own line (e.g. `- [x]
        // Task` with nothing indented beneath it) — that's not "nothing to
        // decorate," just "nothing beyond this line," so the marker's own
        // line end is the floor either way.
        const markerLine = view.state.doc.lineAt(node.from);
        const corrected = computeListItemFold(view.state, markerLine);
        const to = corrected ? corrected.to : markerLine.to;
        if (taskMarker.to >= to) {
          // An empty task (`- [x]`, nothing after the marker, no genuine
          // nested content either) has no content range to decorate.
          return;
        }

        // inclusiveStart/inclusiveEnd: true — same reasoning as
        // `delimitedInlineRenderer`'s own content mark
        // (`inlineLivePreviewParticipants.ts`): required so this mark
        // visually wraps a widget-family participant (WikiLink/Tag/Date)
        // whose range exactly fills the task's content range with no
        // leading/trailing plain text (`- [x] [[Note]]`).
        ranges.push(
          Decoration.mark({ class: TASK_COMPLETED_CLASS, inclusiveStart: true, inclusiveEnd: true }).range(
            taskMarker.to,
            to
          )
        );
      },
    });
  }

  return Decoration.set(ranges, true);
}

interface TaskCompletedContentPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * Default precedence (no `Prec.high`), same as `inlineLivePreviewRegion.ts`'s
 * own content marks (`tok-strike` and friends) — this is an ordinary
 * content mark, not a widget, so it composes correctly alongside them
 * without needing to outrank anything. `wikiLinkLivePreview.ts`'s
 * `Prec.high` widget already ensures WikiLink nests correctly inside any
 * default-precedence mark, this one included.
 */
export function taskCompletedContentDecoration(): Extension {
  return ViewPlugin.fromClass<TaskCompletedContentPlugin>(
    class implements TaskCompletedContentPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (p) => p.decorations }
  );
}
