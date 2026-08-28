import { syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * Clutter's own stated editor-indentation ceiling (2026-08-28 product
 * decision) — one Tab = 2 leading spaces, five levels maximum, applied
 * uniformly to every construct this module recognizes. Deliberately not
 * derived from `indentUnit`/`tabSize` (same reasoning as
 * `leadingIndentDecoration.ts`'s own `SPACE_PX`/`TAB_PX`): this is
 * Clutter's own product rule, not a generic CM6 setting.
 */
export const INDENT_STEP_SPACES = 2;
export const MAX_INDENT_SPACES = 10;

/**
 * What `markdownIndentKeymap.ts` needs to know about one physical
 * document line before deciding whether/how Tab or Shift-Tab should
 * change it. Deliberately narrow — only the two kinds this milestone
 * actually implements (`paragraph`, `list`) carry a payload; every other
 * kind (`heading`, `code`, `unhandled` — which covers blockquote, tables,
 * thematic breaks, HTML blocks, and blank lines) is a plain marker with
 * no fields, since `markdownIndentKeymap.ts` treats all of them
 * identically (this milestone does not touch them — see that file's own
 * doc comment for why "not handled" means "fall through to whatever
 * already handles Tab," not "silently no-op").
 */
export type LineIndentContext =
  | { readonly kind: 'paragraph' }
  | { readonly kind: 'list'; readonly markerFrom: number }
  | { readonly kind: 'heading' }
  | { readonly kind: 'code' }
  | { readonly kind: 'unhandled' };

const HEADING_NODE_NAMES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

/**
 * Resolves what `line` structurally *is*, for indentation purposes, from
 * the current syntax tree alone — never from how the line's own
 * whitespace got there. Probes at the line's first non-whitespace
 * character (the same probe position `blockquoteLineDecoration.ts`/the
 * deleted `listLineDecoration.ts` already used for the identical
 * "which construct owns this physical line" question), so a blank line
 * (`line.text.trim() === ''`) has nothing to probe and is always
 * `unhandled`.
 *
 * `list` is only returned when *this exact physical line* carries the
 * `ListItem`'s own `ListMark` (i.e. `state.doc.lineAt(marker.from).from
 * === line.from`) — a continuation line of a multi-line item (a second
 * paragraph, a nested block, a lazy-continuation row with no marker of
 * its own) resolves to whatever *that line's own* content is instead
 * (its own `Paragraph`, `code`, etc., or `unhandled` if none applies),
 * never to `list`. This keeps the milestone scoped to single-line list
 * items, matching "start with plain bullet lists" — multi-paragraph
 * items are a later phase's question, not silently guessed at here.
 * `EmojiListMark`-led items are excluded the same way
 * `listMarkerDecoration.ts` always excluded them (only `ListMark` — the
 * common node for bullet/ordered/task, since a task's checkbox is a
 * second, later child, not the marker itself — resolves to `list`).
 *
 * A `FencedCode`/`CodeBlock` ancestor is checked *before* `ListItem`/
 * `Blockquote`, so a fence's own content line inside a list item resolves
 * to `code`, not `list` — per this milestone's design, code content
 * always gets ordinary indentation regardless of its enclosing structure.
 *
 * `Blockquote` resolves to `unhandled`, deliberately — blockquote Tab is
 * an explicitly out-of-scope, separately-designed later milestone (it
 * needs to insert a literal `>`, not adjust whitespace, per the earlier
 * design pass); treating it as `unhandled` here means Tab on a
 * blockquote line falls through to whatever already handles Tab, exactly
 * preserving today's behavior rather than silently changing it.
 */
export function resolveLineIndentContext(state: EditorState, line: Line): LineIndentContext {
  if (line.text.trim() === '') {
    return { kind: 'unhandled' };
  }

  const probePos = line.from + firstNonWhitespaceOffset(line.text);
  const leaf = syntaxTree(state).resolveInner(probePos, 1);

  for (let node: SyntaxNode | null = leaf; node; node = node.parent) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      return { kind: 'code' };
    }
    if (node.name === 'ListItem') {
      const marker = node.firstChild;
      if (
        marker &&
        marker.name === 'ListMark' &&
        state.doc.lineAt(marker.from).from === line.from
      ) {
        return { kind: 'list', markerFrom: marker.from };
      }
      break;
    }
    if (node.name === 'Blockquote') {
      return { kind: 'unhandled' };
    }
  }

  for (let node: SyntaxNode | null = leaf; node; node = node.parent) {
    if (HEADING_NODE_NAMES.has(node.name)) {
      return { kind: 'heading' };
    }
    if (node.name === 'Paragraph') {
      return { kind: 'paragraph' };
    }
  }

  return { kind: 'unhandled' };
}

/**
 * The single `{from, to, insert}` change one line needs for the given
 * direction, or `null` when this line's own current indentation is
 * already at the direction's limit (0 for Shift-Tab, `MAX_INDENT_SPACES`
 * for Tab) — a real, meaningful "nothing to do," distinct from `line`
 * not being a `paragraph`/`list` line at all (that distinction is the
 * caller's job, via `resolveLineIndentContext`, not this function's —
 * this function assumes it's already been called for a `paragraph` or
 * `list` line and only computes the arithmetic).
 *
 * Leading-whitespace amount is a plain **character count** of the
 * existing run — never `countColumn`/`tabSize`-aware column math, per
 * Clutter's own stated indentation model (space-driven, not derived from
 * generic CM6 indent facets, same posture as `leadingIndentDecoration.ts`).
 * For `list`, the run is `[line.from, markerFrom)` — the item's own
 * leading whitespace only, never anything about the marker's or a
 * sibling's own width. For `paragraph`, the run is the line's own
 * leading space/tab prefix. Either way, the replacement is always
 * written back as literal space characters — a leading tab (rare, untested by this
 * milestone's own matrix) is counted by its single character like any
 * other whitespace character and normalized away to spaces on the first
 * Tab/Shift-Tab press on that line, a deliberate simplification, not an
 * oversight.
 *
 * `MAX_INDENT_SPACES` is a ceiling on indentation **Tab itself creates**,
 * never a normalization applied to indentation that's already there.
 * Concretely: if `current` is already past the ceiling (existing document
 * text indented more than 10 columns — hand-typed, pasted, or from before
 * this ceiling existed), Tab (`direction === 1`) is a no-op — it never
 * grows *or* shrinks that line — while Shift-Tab still works normally,
 * removing `INDENT_STEP_SPACES` at a time same as anywhere else, letting
 * the user gradually walk it back down. This is why the two directions
 * are computed asymmetrically below rather than both funneling through
 * one shared `Math.min(MAX_INDENT_SPACES, …)` clamp — a single shared
 * clamp would silently truncate existing over-ceiling text down to the
 * ceiling the first time Tab (or even Shift-Tab) touched that line, which
 * is exactly the silent-modification-of-untouched-document-state this
 * function must never do. Nothing here runs unless the user actually
 * presses Tab/Shift-Tab on that specific line — opening or merely
 * displaying a document never calls this at all, so existing indentation
 * of any size is always preserved exactly until a keypress on that line
 * chooses to change it.
 */
export function computeIndentChange(
  line: Line,
  context: { readonly kind: 'paragraph' } | { readonly kind: 'list'; readonly markerFrom: number },
  direction: 1 | -1
): { readonly from: number; readonly to: number; readonly insert: string } | null {
  const leadingEnd =
    context.kind === 'list'
      ? context.markerFrom
      : line.from + /^[ \t]*/.exec(line.text)![0].length;
  const current = leadingEnd - line.from;

  let target: number;
  if (direction === 1) {
    if (current >= MAX_INDENT_SPACES) {
      return null;
    }
    target = Math.min(MAX_INDENT_SPACES, current + INDENT_STEP_SPACES);
  } else {
    target = Math.max(0, current - INDENT_STEP_SPACES);
  }

  if (target === current) {
    return null;
  }

  return { from: line.from, to: leadingEnd, insert: ' '.repeat(target) };
}
