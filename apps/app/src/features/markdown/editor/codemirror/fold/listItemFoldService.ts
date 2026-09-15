import { foldService, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, isIndentedPastColumn, resolveLineIndentContext } from '../indent/markdownIndentContext';

/**
 * List/task-item fold-range correction — the native `foldNodeProp` branch
 * `@codemirror/lang-markdown` installs for `ListItem`/`Task` reports
 * `{from: end of marker line, to: node.to}`, trusting the Lezer node's own
 * `.to` boundary as "what this item owns." That boundary is exactly what
 * CommonMark's lazy-continuation rule can inflate past the item's genuine
 * descendant content: any line with no blank line before it that doesn't
 * trigger a real block-interrupt (a bullet/`1.`-numbered marker, an ATX
 * `#`, a fence, `>`, a thematic break) is absorbed as more literal content
 * of the *same* node, regardless of that line's own indentation — so a
 * completely unrelated, zero-indent sibling paragraph typed directly below
 * a task with no blank line in between silently becomes part of the same
 * `Task` node, and the native fold swallows it too. Confirmed directly
 * against the installed `@lezer/markdown`/`@codemirror/lang-markdown`
 * parser with the project's own grammar config (`TaskList`, `Strikethrough`,
 * `Table`, `IndentedCode` removed) — not a hypothetical.
 *
 * This is a second, independent `foldService`, the same shape
 * `indentedParagraphFoldService.ts` already establishes for the analogous
 * "the native tree-based answer isn't trustworthy here" problem — but the
 * opposite failure direction: that service exists because *nothing* in the
 * tree bounds a bare multi-line paragraph; this one exists because the
 * tree bounds a list item *too generously*. Both are fixed the same way:
 * re-derive the genuine boundary from physical-line indentation
 * (`firstNonWhitespaceOffset`, the same plain-character-count model
 * `markdownIndentContext.ts` already establishes as canonical — never a
 * second, stricter indentation definition invented for folding alone),
 * using the native tree answer only as an upper bound / existence check,
 * never as the final range.
 *
 * **Why indentation, not a tree-shape check**: lazy continuation means the
 * absorbed sibling line and a genuine same-item continuation line are
 * frequently *the same kind of tree node* (both just more text in the same
 * `Paragraph`/`Task` node) — there is no tree boundary between them to
 * inspect in the first place, the identical reason
 * `indentedParagraphFoldService.ts` can't be tree-shape-based either. The
 * one signal that reliably distinguishes "genuinely typed as this item's
 * own nested content" from "an unrelated block that happened to land
 * without a blank line" is indentation relative to the marker's own line:
 * real nested content (a continuation paragraph, a nested list, a nested
 * blockquote, nested fenced code) is conventionally indented past the
 * marker's own column; an unrelated sibling block is not.
 *
 * **Blank lines bridge, they don't stop.** A "loose" list item can
 * legitimately contain multiple blocks separated by blank lines (a second
 * paragraph, a nested list) as long as each remains indented past the
 * marker's own column — unlike `indentedParagraphFoldService.ts` (where a
 * blank line is a hard stop, since nothing there establishes continued
 * container membership across it), a `ListItem` node genuinely is that
 * container when the tree agrees, so this scan skips blank lines rather
 * than stopping at the first one, and only stops at the first *non-blank*
 * line whose own indentation drops back to the marker's own level or
 * below.
 */

/**
 * The enclosing `ListItem` node for a confirmed `kind: 'list'` marker
 * line — a small, local re-walk (mirrors `resolveLineIndentContext`'s own
 * ancestor walk) rather than calling the generic `foldable()` for this:
 * `foldable()` consults every registered `foldService`, including this
 * module's own (`listItemFoldService`, below) — calling it from inside
 * `computeListItemFold` would recurse into itself for the exact same
 * line, confirmed directly (a real `RangeError: Maximum call stack size
 * exceeded` the first version of this function produced). Reading the
 * node directly off the syntax tree gets the identical raw boundary
 * `@codemirror/lang-markdown`'s own `foldNodeProp` branch would have
 * reported, with no facet involved to recurse through.
 */
function enclosingListItem(state: EditorState, linePos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(linePos, 1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      return node;
    }
  }
  return null;
}

/**
 * The core algorithm, exported as a plain function (not only as a
 * `foldService`) so `foldToggleDecoration.ts`'s `computeOwnedRange` can
 * call it directly for a `kind: 'list'` line — the same "both the toggle
 * UI and CM6's own fold keymap must agree" reasoning
 * `computeIndentedParagraphFold` already establishes.
 */
export function computeListItemFold(state: EditorState, line: Line): { from: number; to: number } | null {
  const context = resolveLineIndentContext(state, line);
  if (context.kind !== 'list') {
    return null;
  }

  // The raw tree boundary — used only as an upper bound (never scanned
  // past it) so this correction can never claim more than the parser
  // itself considers part of this ListItem/Task node (e.g. two
  // consecutive blank lines genuinely end a list item's content per
  // CommonMark; the tree's own boundary already reflects that correctly,
  // this scan just never needs to know the rule itself, only respect it).
  // `null` here means the tree itself has nothing past the marker line —
  // genuinely unfoldable, same as this function's own final answer then.
  const node = enclosingListItem(state, line.from);
  if (!node || node.to <= line.to) {
    return null;
  }

  const ownIndent = firstNonWhitespaceOffset(line.text);
  const nativeToLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;

  let lastDescendantLineNumber: number | null = null;
  for (let n = line.number + 1; n <= nativeToLine; n++) {
    const candidate = state.doc.line(n);
    if (candidate.text.trim() === '') {
      // Blank — bridges to a possible later genuine continuation, never
      // itself disqualifying and never itself counted as the boundary.
      continue;
    }
    if (isIndentedPastColumn(candidate, ownIndent)) {
      lastDescendantLineNumber = n;
      continue;
    }
    // A non-blank line at or below the marker's own indentation — either
    // a sibling item in the same list, or an unrelated top-level block
    // lazy-continuation glued onto this node. Never a genuine descendant.
    break;
  }

  if (lastDescendantLineNumber === null) {
    return null;
  }

  return { from: line.to, to: state.doc.line(lastDescendantLineNumber).to };
}

/**
 * The registered `foldService` — needed so CM6's own fold-state keyboard
 * commands (`foldKeymap`'s `Ctrl-Shift-[`/`Cmd-Alt-[`, `foldAll`) fold the
 * same corrected range this module's toggle UI offers, never the raw
 * native `foldNodeProp` answer this service exists to override. Registered
 * ahead of the generic `codeFolding()` fallback the same way
 * `indentedParagraphFoldService()` already is — `@codemirror/language`'s
 * `foldable()` consults every registered `foldService` first, falling back
 * to the generic per-node answer only when every service declines
 * (returns `null`), so this only ever *narrows* what list items fold to,
 * never adds a fold where the native mechanism already correctly found
 * none (this function's own `null` fast-paths on exactly the native
 * answer's own `null`).
 */
export function listItemFoldService(): Extension {
  return foldService.of((state, from, _to) => computeListItemFold(state, state.doc.lineAt(from)));
}
