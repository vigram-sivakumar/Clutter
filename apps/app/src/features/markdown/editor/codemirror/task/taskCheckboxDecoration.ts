import { syntaxTree } from '@codemirror/language';
import { Prec, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import { isTaskMarkerChecked, taskMarkerOfListItem } from './taskEngagement';
import { TaskCheckboxWidget } from './TaskCheckboxWidget';

/**
 * Visual rendering for `TaskMarker` — the missing presentation layer the
 * 2026-08-28 list reset deferred (`MarkdownEditor.tsx`'s own comment:
 * "task checklists... still unrendered"; `listMarkerDecoration.ts`'s own
 * `hasTaskChild` check deliberately excludes task items from its bullet-
 * glyph mechanism, unchanged by this file). The Task/TaskMarker editing
 * semantics (`enter/markdownEnterKeymap.ts`) and the click-toggle logic
 * (`taskCheckboxActivation.ts`) were already correct; this is purely the
 * missing visual half.
 *
 * **Why `Decoration.replace`+`WidgetType`+`atomicRanges`, not
 * `listMarkerDecoration.ts`'s glyph-paint trick** (`color: transparent`
 * + `::before`, used for bullet markers): that mechanism keeps the real
 * marker text in the DOM at its own width and paints a substitute glyph
 * over it — correct for a 1-character marker being re-skinned to another
 * 1-character glyph (`*` → `•`), but `TaskMarker` is always exactly 3
 * source characters (`[`, state char, `]`) collapsing to one visual
 * glyph (`☐`/`☑`); there is no established way to make a 3-character-wide
 * transparent run collapse to 1 visual column without introducing new,
 * unproven CSS. `Decoration.replace` exists precisely for a real
 * character-count-changing visual collapse — the same mechanism already
 * proven for WikiLink/Tag/Date's own at-rest widgets
 * (`inlineLivePreviewRegion.ts`/`wikiLinkLivePreview.ts`) — reused here,
 * not reinvented.
 *
 * **Why this construct has no reveal/conceal (engaged) state at all**,
 * unlike Tag/Date/WikiLink: explicit product decision (task
 * visual-rendering slice) — "do not invent an engaged/focused/reveal
 * Markdown mode," the checkbox must "remain visually rendered even when
 * the caret moves across it." So `buildDecorations` below never consults
 * `isTokenEngaged`/selection at all — every `TaskMarker`, everywhere,
 * always renders as the widget, exactly like WikiLink's own always-atomic
 * at-rest widget, never like Tag/Date's reveal-on-engage branch.
 *
 * **Also conceals the outer `ListMark` + its own separator**
 * (`- `/`* `/`+ `/`1. `) for a task item — not merely leaving it
 * undecorated, which is what `listMarkerDecoration.ts` already does today
 * (`hasTaskChild` → no decoration, but the dash/number is still real,
 * visible, unstyled text). Required visual contract: `"- [ ] Task"` must
 * render as `"☐ Task"`, never `"- ☐ Task"` — the checkbox stands in for
 * the marker position entirely. Applied uniformly to bullet *and* ordered
 * task items alike (`"1. [ ] Task"` → `"☐ Task"`, number included in the
 * concealed range): the only explicit example given (`- [ ] Task` →
 * `☐ Task`) establishes "the checkbox now does the marker's job," and a
 * different, partial rule for ordered task items (hide only the dash,
 * keep the number) would be *more* special-casing, not less — the
 * project's own standing instruction is the smallest general rule, not a
 * per-shape patch. This does **not** touch `listMarkerDecoration.ts`
 * itself, `orderedListRenumbering.ts`, or any numbering logic — the
 * source digits are untouched, only their *rendered* visibility changes,
 * exactly as concealing a heading's `#` doesn't change what heading level
 * it is.
 *
 * Uses `taskMarkerOfListItem` (`taskEngagement.ts`) — the exact same
 * structural walk `enter/markdownEnterKeymap.ts`'s Enter/Backspace
 * commands already use to find a `ListItem`'s `TaskMarker` — so this
 * decoration and that editing logic can never disagree about which nodes
 * count as a task's checkbox.
 */
function buildDecorations(view: EditorView): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

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

        const marker = node.node.firstChild!; // ListMark — validated by taskMarkerOfListItem
        if (taskMarker.from > marker.to) {
          // Conceal the outer marker + its own separator (e.g. "- ",
          // "1. ") — never crosses into a nested-line construct since
          // `taskMarkerOfListItem` only ever returns a same-item, same-
          // physical-line TaskMarker.
          ranges.push(Decoration.replace({}).range(marker.from, taskMarker.from));
        }

        const raw = view.state.sliceDoc(taskMarker.from, taskMarker.to);
        const widget = new TaskCheckboxWidget(isTaskMarkerChecked(raw));
        const checkboxRange = Decoration.replace({ widget }).range(taskMarker.from, taskMarker.to);
        ranges.push(checkboxRange);
        atomicRanges.push(checkboxRange);
      },
    });
  }

  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

interface TaskCheckboxPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

/**
 * `Prec.high`, matching `wikiLinkLivePreview()`'s own reasoning:
 * self-contained regardless of registration order in `MarkdownEditor.tsx`,
 * and consistent with every other Prec.high decoration/keymap extension
 * in this codebase.
 */
export function taskCheckboxDecoration(): Extension {
  const plugin = ViewPlugin.fromClass<TaskCheckboxPlugin>(
    class implements TaskCheckboxPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view));
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(update.view));
        }
      }
    },
    { decorations: (p) => p.decorations }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  return Prec.high([plugin, atomic]);
}
