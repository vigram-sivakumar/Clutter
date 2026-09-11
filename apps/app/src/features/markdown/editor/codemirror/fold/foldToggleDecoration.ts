import { foldable, foldedRanges, foldState, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Line, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import { computeIndentedParagraphFold } from './indentedParagraphFoldService';
import { FoldToggleWidget } from './FoldToggleWidget';

/**
 * Phase 1/3 scope allowlist — headings, list items, fenced code, and
 * (via `computeIndentedParagraphFold`, checked separately below, never
 * through this allowlist) genuinely-qualifying paragraphs.
 *
 * **Why this exists (a real bug, not a hypothetical)**: `@codemirror/
 * lang-markdown`'s own generic `foldNodeProp` branch (confirmed against
 * the installed source, `markdownLanguage.ts`'s own doc comment) makes
 * *any* `Block`-group node other than `Document`/heading/list foldable —
 * including a plain multi-line `Paragraph`. Two ordinary source lines with
 * no blank line between them (a soft-wrapped paragraph authored as
 * separate lines, or — per this codebase's own `IndentedCode` removal —
 * an indented "continuation" line with no structural meaning at all)
 * parse as *one* `Paragraph` node spanning both lines, which
 * `foldable()` then reports as a genuine fold range starting at line 1.
 * Before this allowlist, `foldToggleDecoration()` faithfully surfaced
 * that native range as a toggle on the *first* line of any such paragraph
 * — exposing "fold this ordinary paragraph in half" as a real, working
 * control, confirmed live (not merely theorized) once this widget made
 * that previously-invisible native fold clickable for the first time.
 * `Blockquote`/`Table` fall into the exact same generic branch and would
 * have the identical problem the moment a multi-line instance of either
 * exists — excluded here for the same reason, not yet in scope either.
 *
 * **`Paragraph` is deliberately never added to this set** (Phase 3):
 * doing so would re-admit the exact bug above, since `foldable()` would
 * still fall through to the generic branch for any *non*-qualifying
 * multi-line paragraph the moment `computeOwnedRange` (below) allowed a
 * paragraph line through this allowlist at all. Instead, a `kind:
 * 'paragraph'` line is routed to `computeIndentedParagraphFold` directly,
 * completely bypassing `foldable()`'s own native fallback — see
 * `computeOwnedRange`'s own doc comment.
 *
 * Deliberately narrower than "does `foldable()` return non-null" — this
 * walks the syntax tree at the candidate line's own start to confirm the
 * *construct* actually producing that range is one of the three this
 * covers, not a blanket trust of whatever `foldable()` says.
 */
const HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

function isInScopeFoldOwner(state: EditorState, linePos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(linePos, 1); node; node = node.parent) {
    if (HEADING_NODE_NAMES.has(node.name) || node.name === 'ListItem' || node.name === 'FencedCode') {
      return true;
    }
  }
  return false;
}

/**
 * `@codemirror/language` never exports its own private `findFold` helper
 * (confirmed directly against the installed `@codemirror/language@6.12.4`
 * source — only `foldedRanges`, the public `RangeSet<Decoration>` it reads
 * from, is exported). This is the exact same query upstream's own
 * `findFold` runs internally (`foldedRanges(state).between(from, to, ...)`,
 * taking the earliest-starting match) — a read-only lookup over public
 * state, not a reimplementation of fold *mechanics*: `codeFolding()` still
 * owns `foldState` end to end, this only ever reads it.
 */
function findFold(state: EditorState, from: number, to: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(from, to, (foldFrom, foldTo) => {
    if (!found || found.from > foldFrom) {
      found = { from: foldFrom, to: foldTo };
    }
  });
  return found;
}

/**
 * The single "is this line an owner, and if so what does folding it
 * hide" query for the *offer-to-fold* path — never called for a line
 * that's already folded (see both call sites below, which check
 * `findFold` first). Paragraphs are routed to `computeIndentedParagraphFold`
 * directly, never through `foldable()`'s own native `foldNodeProp`
 * fallback — see `isInScopeFoldOwner`'s own doc comment for why that
 * distinction is load-bearing, not stylistic. Headings/lists/fenced-code
 * are unchanged from Phase 1: `isInScopeFoldOwner` gates a call to the
 * native `foldable()`, which is correct and sufficient for those three.
 */
function computeOwnedRange(state: EditorState, line: Line): { from: number; to: number } | null {
  if (resolveLineIndentContext(state, line).kind === 'paragraph') {
    return computeIndentedParagraphFold(state, line);
  }
  return isInScopeFoldOwner(state, line.from) ? foldable(state, line.from, line.to) : null;
}

/**
 * Resolves the *current* fold/foldable range for the line starting at
 * `linePos`, at whatever moment this is called — never from a value
 * captured earlier. Shared by both decoration placement (below) and
 * `FoldToggleWidget`'s own click handler, so "is this line an owner" and
 * "what does clicking it actually fold/unfold" can never disagree.
 */
function resolveFoldToggleRange(view: EditorView, linePos: number): { from: number; to: number } | null {
  const line = view.state.doc.lineAt(Math.min(linePos, view.state.doc.length));
  const folded = findFold(view.state, line.from, line.to);
  if (folded) {
    return folded;
  }
  // Same `computeOwnedRange` as `buildFoldToggleDecorations` —
  // belt-and-suspenders against a click racing a decoration rebuild
  // (e.g. an edit lands between this widget's construction and the
  // user's click): never fold an out-of-scope/non-qualifying line even
  // if a stale toggle briefly remained.
  return computeOwnedRange(view.state, line);
}

/**
 * Replaces `@codemirror/language`'s own `foldGutter()` UI (a separate
 * `.cm-gutters` column) with an inline, per-line toggle — see
 * `FoldToggleWidget.ts`'s own doc comment for the full division of labor.
 * Mirrors `foldGutter()`'s own reference algorithm line for line (confirmed
 * against the installed source): for every visible line, an existing fold
 * wins over a fresh ownership query, and a line with neither gets no
 * decoration at all — this is a query-only pass, never a second
 * fold-detection mechanism for headings/lists/fenced-code (Phase 3's
 * paragraph case is the one genuine exception — see `computeOwnedRange`).
 *
 * The scope narrowing (`isInScopeFoldOwner`/`computeIndentedParagraphFold`,
 * inside `computeOwnedRange`) is checked only on the *offer-to-fold* path,
 * never on the *already-folded* path (`findFold()`): a range folded some
 * other way (`foldAll`/`Ctrl-Alt-[`, a restored serialized fold state)
 * must always keep a working toggle to unfold it, regardless of which
 * construct it covers — this narrowing only ever limits what this UI
 * *offers to create*, never strands an existing fold with no way back.
 */
function buildFoldToggleDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.viewportLineBlocks) {
    const line = view.state.doc.lineAt(from);
    const folded = findFold(view.state, from, to);
    const ownedRange = folded ?? computeOwnedRange(view.state, line);
    if (!ownedRange) {
      continue;
    }
    ranges.push(
      Decoration.widget({
        widget: new FoldToggleWidget(from, !!folded, resolveFoldToggleRange),
        side: -1,
      }).range(from)
    );
  }

  return Decoration.set(ranges);
}

interface FoldToggleDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

/**
 * The one production entry point — wired in `createEditorView.ts` in the
 * exact spot `foldGutter()` previously occupied, under the same `readOnly`
 * gate `codeFolding()` already uses (a note embed's nested view stays fully
 * expanded and unfoldable, per that gate's own doc comment — unchanged by
 * this replacement).
 */
export function foldToggleDecoration(): Extension {
  return ViewPlugin.fromClass<FoldToggleDecorationPlugin>(
    class implements FoldToggleDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildFoldToggleDecorations(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.startState.field(foldState, false) !== update.state.field(foldState, false) ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = buildFoldToggleDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
