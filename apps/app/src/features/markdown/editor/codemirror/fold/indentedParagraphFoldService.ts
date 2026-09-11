import { foldService, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { firstNonWhitespaceOffset, resolveLineIndentContext } from '../indent/markdownIndentContext';

/**
 * Phase 3 — indentation-based paragraph folding. Deliberately **not**
 * built on `@codemirror/lang-markdown`'s own generic `foldNodeProp`
 * branch (the mechanism headings/lists/fenced-code already get for free)
 * — that branch makes *any* `Block`-group node other than `Document`/
 * heading/list foldable, including a plain multi-line `Paragraph`, which
 * is exactly the Phase 1 bug this codebase already found and worked
 * around once (`foldToggleDecoration.ts`'s own `isInScopeFoldOwner`
 * allowlist excludes `Paragraph` for precisely this reason). This is a
 * second, independent `foldService` that only ever returns a range for a
 * paragraph that *genuinely* owns more-indented paragraph content beneath
 * it — the generic branch is never consulted for a paragraph anywhere in
 * this codebase's own UI (`foldToggleDecoration.ts` calls
 * `computeIndentedParagraphFold` directly for a `kind: 'paragraph'` line,
 * never the native `foldable()`).
 *
 * **Why this can't be a syntax-tree-boundary computation** (confirmed
 * directly against the installed `@lezer/markdown@1.7.2` parser, not
 * assumed): CommonMark's own "a paragraph continuation line is anything
 * that doesn't start a new block, regardless of its own indentation"
 * rule means `Parent paragraph\n    Child paragraph` — no blank line
 * between them — parses as **one** `Paragraph` node spanning both
 * physical lines, not a parent node and a child node. There is no tree
 * boundary between "Parent paragraph" and its indented "children" to
 * fold at in that case; this scan works over physical lines and their own
 * leading-whitespace width instead, using the syntax tree only to confirm
 * a line is genuine paragraph content (never hijacking a list/heading/
 * code/blockquote line — `resolveLineIndentContext` already excludes all
 * of those before ever returning `kind: 'paragraph'`).
 *
 * **Blank line: a hard stop, not absorbed.** Considered and rejected: the
 * absorption Clutter already grants blank lines elsewhere
 * (`orderedListStructuralNormalization.ts`'s own "a blank line between
 * two same-delimiter list items... never splits the list") is backed by
 * a real, continuing CommonMark container (an `OrderedList`/`BulletList`
 * node genuinely spans across that blank line in the parse tree) — there
 * is no analogous container for bare indented paragraphs; nothing in the
 * document marks a blank line as "still part of this outline branch."
 * Absorbing it here would be a Clutter-invented interpretation with zero
 * textual signal backing it, not a reuse of an existing, principled
 * convention — so a blank line ends the run, matching CommonMark's own
 * default (blank line ends a paragraph) rather than inventing an
 * exception to it.
 *
 * **Indentation threshold: a plain "more than the parent's own," not a
 * multiple of `INDENT_STEP_SPACES`.** Matches `markdownIndentContext.ts`'s
 * own stated model for the *exact same* leading-whitespace quantity
 * (`computeIndentChange`'s doc comment: "a plain character count of the
 * existing run — never `countColumn`/`tabSize`-aware column math"); a
 * second, stricter rule invented specifically for folding would disagree
 * with the one Tab/Shift-Tab already uses for "how indented is this
 * line," which is the actual established convention to check against.
 */

/**
 * True only when `line` is the *first* physical line of its own enclosing
 * `Paragraph` node — a continuation line of a multi-line paragraph (lazy
 * continuation, no blank line) resolves to `kind: 'paragraph'` exactly
 * like its owner does, per `resolveLineIndentContext`'s own doc comment,
 * so this is what disambiguates the two. Mirrors that function's own
 * `kind: 'list'` restriction to exactly the `ListItem`'s marker line —
 * the identical "only the line that actually starts the construct" check,
 * applied to `Paragraph` instead of `ListItem`.
 */
function isParagraphOwnerLine(state: EditorState, line: Line): boolean {
  const probePos = line.from + firstNonWhitespaceOffset(line.text);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'Paragraph') {
      return state.doc.lineAt(node.from).from === line.from;
    }
  }
  return false;
}

/**
 * The core algorithm, exported as a plain function (not only as a
 * `foldService`) so `foldToggleDecoration.ts` can call it directly for a
 * `kind: 'paragraph'` line instead of going through the native
 * `foldable()` — see this file's own top doc comment for why that
 * distinction matters here specifically.
 */
export function computeIndentedParagraphFold(
  state: EditorState,
  line: Line
): { from: number; to: number } | null {
  if (resolveLineIndentContext(state, line).kind !== 'paragraph' || !isParagraphOwnerLine(state, line)) {
    return null;
  }

  const ownIndent = firstNonWhitespaceOffset(line.text);
  let lastDescendantLineNumber: number | null = null;

  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const candidate = state.doc.line(n);
    if (candidate.text.trim() === '') {
      break;
    }
    if (resolveLineIndentContext(state, candidate).kind !== 'paragraph') {
      break;
    }
    if (firstNonWhitespaceOffset(candidate.text) <= ownIndent) {
      break;
    }
    lastDescendantLineNumber = n;
  }

  if (lastDescendantLineNumber === null) {
    return null;
  }

  return { from: line.to, to: state.doc.line(lastDescendantLineNumber).to };
}

/**
 * The registered `foldService` — needed so CM6's own fold-state
 * keyboard commands (`foldKeymap`'s `Ctrl-Shift-[`/`Cmd-Alt-[`,
 * `foldAll`/`Ctrl-Alt-[`) work for a genuinely-qualifying paragraph the
 * same way they already do for headings/lists/fenced-code — `codeFolding()`
 * itself is unmodified; this is the only new fold *detection* surface
 * Phase 3 adds, and it only ever fires for the same lines
 * `computeIndentedParagraphFold` (and therefore the toggle UI) already
 * agrees are legitimate owners.
 */
export function indentedParagraphFoldService(): Extension {
  return foldService.of((state, from, _to) => computeIndentedParagraphFold(state, state.doc.lineAt(from)));
}
