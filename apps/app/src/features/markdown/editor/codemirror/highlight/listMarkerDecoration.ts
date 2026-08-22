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
import type { SyntaxNode } from '@lezer/common';

import { isTaskMarkerChecked } from '../task/taskEngagement';
import { TaskCheckboxWidget } from '../task/TaskCheckboxWidget';

/**
 * Live Preview rendering for list item prefixes — bullet (`-`/`*`/`+`),
 * ordered (`1.`/`2)`/…), and task (`- [ ]`/`- [x]`) — all three in one
 * module, one tree walk, one decoration set. Deliberately not built on
 * `liveMarkDecoration.ts`/`semanticToken/tokenDecorations.ts`: both of
 * those exist to answer "collapse this one node's own range, or don't,
 * based on that node's own engagement" — a task marker needs something
 * those mechanisms don't provide, a *shared* reveal/hide decision spanning
 * two sibling nodes (`ListMark` + `TaskMarker`) as a single visual unit,
 * so the dash and the checkbox can never disagree (see `markerRange`
 * below). Expressing that by threading a second, wider "engagement range"
 * concept through either shared mechanism would be more machinery than
 * just walking the tree directly here — so this does, using the same
 * primitive (`Decoration.mark`/`Decoration.replace`, a plain `ViewPlugin`)
 * every other decoration in this codebase already reduces to.
 *
 * The model is exactly: syntax tree decides *what* a marker is (bullet vs.
 * ordered vs. task, via `ListMark`'s own text and whether it owns a
 * `Task`), current selection decides whether it's *rendered* (a styled
 * `Decoration.mark` over the real text, or a checkbox widget) or
 * *revealed* (no decoration at all — the real Markdown text underneath
 * was always there, so "revealed" is simply "nothing hides it this pass").
 * Falling back to plain text when the syntax itself breaks needs no
 * separate handling: a broken `ListMark`/`TaskMarker` simply isn't visited
 * by the tree walk below.
 *
 * `ListItem`'s `firstChild` is always `ListMark` (confirmed directly
 * against the installed `@lezer/markdown@1.7.2`: bullet and ordered
 * markers alike).
 */
const isBulletMarker = (raw: string): boolean => raw === '-' || raw === '*' || raw === '+';

/**
 * A `ListItem` wrapping a task (`ListItem → ListMark, Task → TaskMarker`,
 * confirmed against the installed `@lezer/markdown`'s `TaskList`
 * extension) is structurally distinguished from a plain `ListItem →
 * ListMark, Paragraph` by its second child's node *name* — `Task` vs.
 * `Paragraph` — never by re-inspecting source characters (`[ ]`/`[x]`).
 * Returns the `TaskMarker` node itself (not just a boolean) since callers
 * need its exact range, not merely its presence.
 */
export function findTaskMarker(listItem: SyntaxNode): SyntaxNode | null {
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Task') {
      const taskMarker = child.firstChild;
      return taskMarker && taskMarker.name === 'TaskMarker' ? taskMarker : null;
    }
  }
  return null;
}

/**
 * The single Markdown range a list marker's render-vs-reveal decision is
 * made against: for a plain bullet/ordered item, the `ListMark` itself
 * (`-`, `1.`); for a task, `ListMark` through `TaskMarker` combined —
 * `"- [ ]"`/`"- [x]"` as one unit. The combined range is what prevents the
 * mixed state a per-node check would allow (cursor landing exactly on the
 * `-` revealing it while the checkbox widget stays rendered next to the
 * now-raw dash): both the dash and the checkbox are decided from this one
 * range, so they can never disagree.
 *
 * Exported for `listIndentWhitespaceDecoration.ts`, which needs the same
 * range to decide whether the whitespace immediately around a marker
 * should track it as rendered or revealed — including for an emoji
 * marker's `EmojiListMark`, even though this module's own `buildDecorations`
 * below never renders one itself (that stays `emojiListMarkDecoration.ts`'s
 * job, untouched).
 */
export function markerRange(listItem: SyntaxNode): { from: number; to: number } | null {
  const marker = listItem.firstChild;
  if (!marker || (marker.name !== 'ListMark' && marker.name !== 'EmojiListMark')) {
    return null;
  }
  const taskMarker = findTaskMarker(listItem);
  return { from: marker.from, to: taskMarker ? taskMarker.to : marker.to };
}

/** Selection strictly within `range` (a zero-width caret at either boundary counts) — the one trigger for reveal. Never doc-changed, never "typing somewhere on the line." */
function selectionWithin(view: EditorView, range: { from: number; to: number }): boolean {
  const selection = view.state.selection.main;
  return selection.from >= range.from && selection.to <= range.to;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'ListItem') {
          return;
        }

        const marker = node.node.firstChild;
        if (!marker || marker.name !== 'ListMark') {
          return; // EmojiListMark stays emojiListMarkDecoration.ts's job
        }

        const range = markerRange(node.node);
        if (!range || selectionWithin(view, range)) {
          return;
        }

        const taskMarker = findTaskMarker(node.node);
        if (taskMarker) {
          const raw = view.state.sliceDoc(taskMarker.from, taskMarker.to);
          builder.add(
            range.from,
            range.to,
            Decoration.replace({ widget: new TaskCheckboxWidget(isTaskMarkerChecked(raw)) })
          );
          return;
        }

        const raw = view.state.sliceDoc(range.from, range.to);
        const className = isBulletMarker(raw)
          ? 'cm-list-marker cm-bullet-list-marker'
          : 'cm-list-marker cm-list-number';
        builder.add(range.from, range.to, Decoration.mark({ class: className }));
      },
    });
  }

  return builder.finish();
}

/**
 * Only the task-checkbox ranges above are atomic (single Backspace/Delete
 * removes the whole `- [ ]`/`- [x]` unit, matching the previous
 * `semanticTokenDecorations` behavior for this construct) — bullet/ordered
 * marks must stay individually, character-by-character editable, so they
 * are deliberately excluded here even though they're both built in the
 * same tree walk.
 */
function buildAtomicRanges(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const atomic = Decoration.mark({});

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'ListItem') {
          return;
        }
        const range = markerRange(node.node);
        if (!range || selectionWithin(view, range) || !findTaskMarker(node.node)) {
          return;
        }
        builder.add(range.from, range.to, atomic);
      },
    });
  }

  return builder.finish();
}

interface ListMarkerPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

export function listMarkerDecoration(): Extension {
  const plugin = ViewPlugin.fromClass<ListMarkerPlugin>(
    class implements ListMarkerPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
        this.atomic = buildAtomicRanges(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
          this.atomic = buildAtomicRanges(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );

  const atomicRanges = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  return [plugin, atomicRanges];
}
