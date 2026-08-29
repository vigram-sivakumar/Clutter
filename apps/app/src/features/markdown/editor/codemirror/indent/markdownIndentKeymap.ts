import {
  Prec,
  type ChangeSpec,
  type Extension,
  type Line,
  type StateCommand,
} from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { INDENT_STEP_SPACES } from './markdownIndentContext';

/**
 * Markdown-aware Tab/Shift-Tab.
 *
 * Deliberately minimal (simplified 2026-08-29, after investigation showed
 * the previous construct-aware version — paragraph/list handled, heading/
 * blockquote/code/blank excluded — produced byte-identical results to
 * plain CM6 `indentMore`/`indentLess` in every tested case *except* two
 * narrow, cosmetic ones (skipping non-list/paragraph lines in a mixed
 * selection, and skipping blank lines), and that a genuinely stronger
 * guarantee — indenting list lines without ever letting the parser
 * reclassify/reparent them — is not achievable at all while staying valid
 * CommonMark; see the investigation this change reports for the full
 * reasoning. What's left is exactly the one behavior actually wanted:
 *
 * Every physical document line touched by the selection gets the same
 * `INDENT_STEP_SPACES` added to (Tab) or removed from (Shift-Tab) its own
 * leading whitespace, independently of every other line and regardless of
 * what construct it is — no paragraph/list/heading/blockquote/code
 * distinction, no syntax-tree lookup, no parser-hierarchy preservation, no
 * reparse/validation step. List hierarchy is left entirely to the parser,
 * to interpret however CommonMark says to on the next reparse.
 *
 * Reasons this still exists rather than a plain generic-indent extension:
 * (1) it operates on real **document** lines, never visual/wrapped rows —
 * a soft-wrapped paragraph gets exactly one change, at its real start,
 * regardless of which wrapped row the caret is on; (2) whitespace is
 * always written back as literal space characters, per Clutter's own
 * space-driven indentation model (`INDENT_STEP_SPACES`), not derived from
 * CM6's generic `indentUnit`/`tabSize` facets.
 *
 * Growth via Tab is capped at `MAX_INDENT_LEVELS` (5) — a flat, per-line
 * ceiling, not a parser/hierarchy concept: a line already at or past
 * `MAX_INDENT_SPACES` simply produces no further change on Tab, exactly
 * like Shift-Tab's existing 0-space floor. Shift-Tab is never capped by
 * this — a line manually indented deeper than the ceiling (e.g. pasted
 * content) can still be dedented all the way back down.
 */

const MAX_INDENT_LEVELS = 5;
const MAX_INDENT_SPACES = MAX_INDENT_LEVELS * INDENT_STEP_SPACES;

function lineIndentChange(line: Line, direction: 1 | -1): ChangeSpec | null {
  const leadingEnd = line.from + /^[ \t]*/.exec(line.text)![0].length;
  const current = leadingEnd - line.from;
  // `Math.max(current, …)` on growth: a line already past the ceiling
  // (pasted/typed content, not reached via Tab) must never be shrunk by
  // pressing Tab — only prevented from growing further.
  const target =
    direction === 1
      ? Math.max(current, Math.min(current + INDENT_STEP_SPACES, MAX_INDENT_SPACES))
      : Math.max(0, current - INDENT_STEP_SPACES);

  if (target === current) {
    return null;
  }

  return { from: line.from, to: leadingEnd, insert: ' '.repeat(target) };
}

/**
 * Shared implementation for both directions. Walks every physical line
 * touched by every selection range (deduplicated, so an empty/collapsed
 * range and a range spanning several lines are both handled by the same
 * loop), collecting one `ChangeSpec` per line that actually changes.
 *
 * Always returns `true` — this keymap never defers to CM6's generic
 * `indentWithTab` beneath it, since every line is always "supported" now.
 * A line already at its direction's limit (Shift-Tab's 0-space floor;
 * Tab's `MAX_INDENT_SPACES` ceiling) simply contributes no change, exactly
 * like a no-op keypress elsewhere in the editor — not a decline.
 */
function markdownIndentDirection(direction: 1 | -1): StateCommand {
  return ({ state, dispatch }) => {
    const seenLines = new Set<number>();
    const changes: ChangeSpec[] = [];

    for (const range of state.selection.ranges) {
      let pos = range.from;
      while (pos <= range.to) {
        const line = state.doc.lineAt(pos);
        if (!seenLines.has(line.from)) {
          seenLines.add(line.from);
          const change = lineIndentChange(line, direction);
          if (change) {
            changes.push(change);
          }
        }
        pos = line.to + 1;
      }
    }

    if (changes.length) {
      const changeSet = state.changes(changes);
      dispatch(
        state.update({
          changes: changeSet,
          // Tab's changes are pure insertions of new leading whitespace.
          // CM6's default selection mapping (`assoc = -1`, used whenever
          // a transaction leaves `selection` unset) keeps a position that
          // sits exactly at an insertion point *behind* the inserted
          // text — so a caret at true content-start (no existing
          // indentation before it) stayed put while the indentation was
          // inserted in front of it. Mapping the selection forward
          // through the same `changeSet` with `assoc = 1` instead keeps
          // the caret attached to the content it was next to, matching
          // the already-correct behavior at every other caret position.
          // Shift-Tab's changes are replacements/deletions, not pure
          // insertions at the caret, so its default mapping is already
          // correct and is left untouched.
          selection: direction === 1 ? state.selection.map(changeSet, 1) : undefined,
          userEvent: direction === 1 ? 'input.indent' : 'delete.dedent',
        })
      );
    }

    return true;
  };
}

export const markdownIndentMore: StateCommand = markdownIndentDirection(1);
export const markdownIndentLess: StateCommand = markdownIndentDirection(-1);

/**
 * `Prec.high`, same precedence `markdownEnterKeymap()` already uses, for
 * the identical reason: it must win over `createEditorView.ts`'s own
 * `indentWithTab` (registered in that file's lowest-priority keymap,
 * added last) without that shared, non-Markdown-specific file needing any
 * change at all. Since this keymap never declines, `indentWithTab` is
 * effectively fully shadowed for Markdown editing — kept anyway as the
 * fallback for any non-Markdown editor CM6 config in this app might reuse.
 */
export function markdownIndentKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Tab', run: markdownIndentMore },
      { key: 'Shift-Tab', run: markdownIndentLess },
    ])
  );
}
