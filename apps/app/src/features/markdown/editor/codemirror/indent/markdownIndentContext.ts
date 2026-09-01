import { syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * **The single canonical indentation-unit value for the entire Markdown
 * editor** (2026-08-30, Option C migration — docs/list-item-architecture-odr.md
 * §22 onward). One indentation level is `INDENT_STEP_SPACES` literal space
 * characters. Every other place in this codebase or in CM6 itself that
 * needs to know "how big is one indentation level" must derive from this
 * constant, directly or via `INDENT_UNIT_STRING` below — never restate the
 * number independently. Changing this one line (and, for the CM6-facing
 * half, nothing else) is the entire footprint of a future unit change
 * (e.g. 4 → 6, or spaces → tabs): that is the point of centralizing it
 * here, not a byproduct.
 *
 * Two consumers, two mechanisms, one source of truth:
 * 1. **Clutter's own Tab/Shift-Tab** (`markdownIndentKeymap.ts`) reads
 *    this constant directly — it never touches CM6's generic
 *    `indentUnit`/`tabSize` facets at all, by design (Clutter's own
 *    space-driven model, not a generic CM6 setting — same reasoning as
 *    `leadingIndentDecoration.ts`'s own pixel metrics, which derive from
 *    `--md-indent` in the design token system).
 * 2. **Every CM6-internal indentation-aware command** — `deleteCharBackward`
 *    (Backspace's whitespace-only-prefix deletion), `insertNewlineAndIndent`
 *    (Enter's fallback), `indentMore`/`indentLess`/`indentSelection` (also
 *    reachable directly via Cmd+]/Cmd+[/Cmd-Alt-\\, unshadowed by
 *    Clutter's own Tab keymap), and `markdownEnterKeymap.ts`'s own
 *    `exitEmptyIndentContinuation` — all read CM6's `indentUnit`/`tabSize`
 *    facets, never this constant directly. `createEditorView.ts`
 *    configures `indentUnit.of(INDENT_UNIT_STRING)` from this exact
 *    constant, so mechanism 2 stays synchronized with mechanism 1 without
 *    either one importing the other's machinery — confirmed by a full
 *    repository-wide audit (this document's own investigation record) that
 *    every one of these CM6-internal call sites reads the facet, never a
 *    hardcoded number, so configuring the facet once is sufficient for all
 *    of them.
 *
 * There is no maximum on Tab/Shift-Tab's own growth beyond the two
 * derived ceiling constants in `markdownIndentKeymap.ts`. Tab/Shift-Tab
 * are source-local operations: they write only the touched line's own
 * leading-whitespace run and never discover, inspect, or require a
 * parent/ancestor list item. Deep or parent-less indentation must remain
 * possible (Markdown list nesting is a property the parser derives from
 * the resulting source on every reparse, not something this module
 * tracks or protects).
 */
export const INDENT_STEP_SPACES = 4;

/**
 * `INDENT_STEP_SPACES` literal space characters, as a string — the exact
 * value `createEditorView.ts` configures CM6's `indentUnit` facet to, and
 * the only place that string is constructed. No other file should build
 * its own `' '.repeat(...)` string meant to represent "one indentation
 * level" — call sites that need the per-line growth/shrink *amount*
 * (`markdownIndentKeymap.ts`) use `INDENT_STEP_SPACES` directly instead,
 * since they're adding/removing a number, not inserting a fixed string.
 */
export const INDENT_UNIT_STRING = ' '.repeat(INDENT_STEP_SPACES);

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
 * already at the direction's limit (0 for Shift-Tab — Tab has no limit)
 * — a real, meaningful "nothing to do," distinct from `line` not being a
 * `paragraph`/`list` line at all (that distinction is the caller's job,
 * via `resolveLineIndentContext`, not this function's — this function
 * assumes it's already been called for a `paragraph` or `list` line and
 * only computes the arithmetic).
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
 * This function only ever computes and returns a change for the *one*
 * line it was called with — it never inspects, and the caller never
 * passes it, any other line. List hierarchy (which `ListItem` a line
 * ends up inside) is a consequence the parser derives from the resulting
 * source on the next reparse, not something this function tracks,
 * preserves, or requires as a precondition — a line with no parent
 * anywhere in the document is exactly as indentable as one with several
 * ancestors.
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

  const target = direction === 1 ? current + INDENT_STEP_SPACES : Math.max(0, current - INDENT_STEP_SPACES);

  if (target === current) {
    return null;
  }

  return { from: line.from, to: leadingEnd, insert: ' '.repeat(target) };
}
