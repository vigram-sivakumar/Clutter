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

/**
 * Nesting depth of a `ListItem` — how many `ListItem` *ancestors* contain
 * it, excluding itself. A top-level item has no `ListItem` ancestor, so
 * depth 0; an item nested one level inside another list item is depth 1,
 * and so on. Uniform across bullet, ordered, task, and emoji lists:
 * `emojiListSyntax.ts`'s `EmojiList` composite starts a `ListItem` exactly
 * like `BulletList`/`OrderedList` do (confirmed by direct inspection of
 * the parser), so no per-list-type branching is needed here — a `Task` is
 * just a `ListItem` whose second child happens to be a `Task` node instead
 * of a `Paragraph`.
 */
function listDepth(node: SyntaxNode): number {
  let depth = 0;
  for (let n: SyntaxNode | null = node.parent; n; n = n.parent) {
    if (n.name === 'ListItem') {
      depth++;
    }
  }
  return depth;
}

function listLineMark(depth: number): Decoration {
  return Decoration.line({
    attributes: { class: 'cm-list-line', style: `--list-depth: ${depth}` },
  });
}

/**
 * Reserves a hanging-indent column (`.cm-list-line`, styled in
 * MarkdownEditor.css) on every physical document line that starts a
 * *nested* `ListItem` — bullet, ordered, task, or emoji alike — so a long
 * nested item's wrapped continuation lands under the list's own indent
 * rather than the editor's left edge. A top-level item (depth 0) gets
 * neither the class nor `--list-depth` at all: `.cm-line`'s own base
 * indentation is already 0 (see MarkdownEditor.css), so there is nothing
 * for a depth-0 line decoration to add.
 *
 * One mechanism shared by every list type, replacing the previous
 * Task-only `taskLineIndent.ts`. The indent is driven entirely by
 * `--list-depth`, the `ListItem` nesting depth read from the syntax tree —
 * never from marker width, and never from Tab/Shift-Tab keypresses
 * directly. `listIndentKeymap.ts`'s Tab/Shift-Tab only ever change the
 * underlying Markdown indentation text; the syntax tree reparses from
 * that, and `--list-depth` is re-derived from the reparsed tree on the
 * next `update()` here — so manual indentation edits and paste are
 * handled for free, the same as typed input.
 *
 * A block-level (`Decoration.line`) concern, not something the inline
 * marker widgets (`ListBulletWidget`/`OrderedListMarkerWidget`/
 * `TaskCheckboxWidget`/the emoji glyph itself) can solve on their own:
 * only a line decoration's `padding-left` reserves space across a
 * browser-soft-wrapped continuation of the same physical line. No
 * `text-indent` counter-offset is used — the marker is never pulled back
 * out of the reserved indent or positioned independently; it moves with
 * the rest of the line's content as one box, per `.cm-list-line`'s CSS
 * rule in MarkdownEditor.css.
 */
function buildListLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'ListItem') {
          return;
        }

        const depth = listDepth(node.node);
        if (depth === 0) {
          return;
        }

        const line = view.state.doc.lineAt(node.from);
        if (seenLines.has(line.from)) {
          return;
        }
        seenLines.add(line.from);

        builder.add(line.from, line.from, listLineMark(depth));
      },
    });
  }

  return builder.finish();
}

interface ListLineDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function listLineDecoration(): Extension {
  return ViewPlugin.fromClass<ListLineDecorationPlugin>(
    class implements ListLineDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildListLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildListLineDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
