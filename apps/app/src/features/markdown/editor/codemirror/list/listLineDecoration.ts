import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type EditorState, type Extension } from '@codemirror/state';
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

function leadingWhitespaceLength(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/**
 * The nearest `ListItem` ancestor whose range contains `probePos` — pure
 * tree navigation, no line/column math. `resolveInner` itself is what
 * makes the *probe position* matter (see `buildListLineDecorations`'s own
 * doc comment): the correct owning `ListItem` for a physical line is
 * whichever one contains that line's first non-whitespace character, not
 * whichever one merely contains column 0.
 */
function nearestListItem(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'ListItem') {
      return node;
    }
  }
  return null;
}

/**
 * Reserves a hanging-indent column (`.cm-list-line`, styled in
 * MarkdownEditor.css) on every physical document line owned by a
 * `ListItem` — bullet, ordered, task, or emoji alike — so a long item's
 * wrapped continuation lands under the list's own indent rather than the
 * editor's left edge.
 *
 * "Owned by a `ListItem`" is deliberately broader than "starts a
 * `ListItem`": a `ListItem` can hold more than one block child (a second
 * paragraph, a nested list, a fenced code block, a blockquote, …), each on
 * its own physical line, and a `ListItem`'s own `Paragraph` can extend
 * across a lazy-continuation line that carries no marker of its own at
 * all — none of those lines *start* the `ListItem`, but all of them need
 * the same indent treatment as the line its marker sits on. Iterating
 * `ListItem` nodes and decorating only `doc.lineAt(node.from)` (the
 * previous approach here) misses every one of them; iterating every
 * visible physical line and asking "which `ListItem`, if any, owns this
 * line" instead covers all of them uniformly, with no special-casing per
 * continuation kind.
 *
 * Depth 0 is included (not skipped): unlike nesting-only indentation,
 * which top-level items genuinely don't need, the marker/text hanging
 * indent this decoration also drives (via `--list-depth`'s CSS, see
 * MarkdownEditor.css) is needed even at depth 0, since a depth-0 marker
 * still occupies its own column that wrapped continuation must land past.
 *
 * The probe position for "which `ListItem` owns this line" is the line's
 * first non-whitespace character, never column 0 (`line.from`) — the same
 * fix `listIndentKeymap.ts`'s `listItemStartingAt` already applies, and
 * for the identical reason: a nested item's leading indentation belongs to
 * no syntax node at all (confirmed by direct inspection of the parsed
 * tree), so resolving at column 0 on an indented line can only ever land
 * on a *shallower* ancestor whose range happens to span that unclaimed
 * gap — never the line's own deepest owning `ListItem`. A lazy-continuation
 * line with no leading whitespace needs no adjustment (its first
 * non-whitespace character already is `line.from`).
 *
 * Blank lines are skipped — no visible content to hang-align, and
 * `line.from + 0` would otherwise probe into whatever construct happens to
 * follow, which is not this line's own concern.
 *
 * A physical line whose probe position resolves to no `ListItem` ancestor
 * at all (a plain paragraph, a heading, a blockquote that isn't itself
 * inside a list) gets no decoration — matching the previous behavior for
 * genuinely unrelated content. A blockquote visually indented merely by
 * its own `>` marker still gets nothing unless a real `ListItem` ancestor
 * exists in the tree; visual indentation alone is never used as a signal.
 *
 * The indent is driven entirely by `--list-depth`, the owning `ListItem`'s
 * nesting depth read from the syntax tree — never from marker width, and
 * never from Tab/Shift-Tab keypresses directly. `listIndentKeymap.ts`'s
 * Tab/Shift-Tab only ever change the underlying Markdown indentation text;
 * the syntax tree reparses from that, and `--list-depth` is re-derived
 * from the reparsed tree on the next `update()` here — so manual
 * indentation edits and paste are handled for free, the same as typed
 * input.
 *
 * A block-level (`Decoration.line`) concern, not something the inline
 * marker widgets (`ListBulletWidget`/`OrderedListMarkerWidget`/
 * `TaskCheckboxWidget`/the emoji glyph itself) can solve on their own:
 * only a line decoration's `padding-left` reserves space across a
 * browser-soft-wrapped continuation of the same physical line. Paired with
 * a `text-indent` counter-offset in MarkdownEditor.css (the marker's own
 * fixed `--marker-size` column, pulled back on the line's first visual row
 * only) so wrapped rows land under the text rather than under the marker —
 * see MarkdownEditor.css's own doc comment on `.cm-list-line` for the full
 * hanging-indent rationale.
 */
function buildListLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (seenLines.has(line.from)) {
        pos = line.to + 1;
        continue;
      }
      seenLines.add(line.from);

      const indent = leadingWhitespaceLength(line.text);
      if (indent < line.text.length) {
        const probePos = line.from + indent;
        const listItem = nearestListItem(view.state, probePos);
        if (listItem) {
          builder.add(line.from, line.from, listLineMark(listDepth(listItem)));
        }
      }

      pos = line.to + 1;
    }
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
