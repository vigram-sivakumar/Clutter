import {
  EditorState,
  Prec,
  type ChangeSpec,
  type Extension,
  type Line,
  type StateCommand,
} from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { planOrderedListNormalization } from '../list/orderedListTabNormalization';
import { markdownLanguageExtension } from '../markdownLanguage';
import { INDENT_STEP_SPACES, resolveLineIndentContext } from './markdownIndentContext';

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
 * distinction, no syntax-tree lookup, no parser-hierarchy preservation.
 * List hierarchy is left entirely to the parser, to interpret however
 * CommonMark says to on the next reparse. **This computation itself is
 * unchanged and untouched by the numbering step below** — nothing here
 * ever consults the tree, a marker's width, or any parent/child/sibling
 * relationship to decide how much a line indents.
 *
 * A separate, later step (`planOrderedListNormalization`,
 * `../list/orderedListTabNormalization.ts`, product decision 2026-08-30 —
 * docs/list-item-architecture-odr.md §16/§20) *does* reparse, strictly
 * after this computation is complete: it inspects the resulting
 * provisional tree purely to detect whether a touched line's own
 * `OrderedList` membership genuinely changed, and if so, renumbers the
 * lists it left and joined. That step never feeds back into, overrides,
 * or is consulted by the whitespace arithmetic above — it only ever
 * consumes this function's own output as opaque `{from,to,insert}` data,
 * strictly one-directional, so this file's own indentation contract
 * (below) is not amended, only composed with a second, independent
 * concern dispatched in the same transaction.
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

const NESTABLE_LIST_NAMES: ReadonlySet<string> = new Set(['BulletList', 'OrderedList', 'EmojiList']);

/** Whether a list item has an item to nest under: an earlier item in its list, or a list directly before its list. */
function hasItemToNestUnder(state: EditorState, markerFrom: number): boolean {
  let item: SyntaxNode | null = syntaxTree(state).resolveInner(markerFrom, 1);
  while (item && item.name !== 'ListItem') {
    item = item.parent;
  }
  if (!item) {
    return true;
  }
  if (item.prevSibling) {
    return true;
  }
  const before = item.parent?.prevSibling;
  return !!before && NESTABLE_LIST_NAMES.has(before.name);
}

/**
 * Drops the Tab edit of a list line that would leave it no longer a list item *and* has nothing to nest under:
 * the first item of a list, or one already a level below the item above it. Four more spaces do not nest such an
 * item; by CommonMark the result is an indented code block (a list's first item at four columns) or lazy text of the
 * item above, so the line is left alone and a bullet never turns into code. Judged on a provisional copy with *all*
 * the selected lines' edits applied and reparsed (the way `planOrderedListNormalization` checks), so a block that
 * moves together stays together: a first item is skipped while the items below it still nest, and an item under a
 * selected parent that does move is kept. Repeats until nothing more is dropped.
 *
 * A line that does have an item to nest under is never dropped unless it becomes code: a very wide ordered marker
 * (`99999.`) can need several presses to reach its parent's content column, and the presses in between must still
 * go through (see the wide-marker tests). Only marker lines of real list items (bullet, ordered, task, emoji) are
 * ever considered; every other line is indented as before.
 */
function dropEditsThatEndAListItem(state: EditorState, edits: ChangeSpec[]): ChangeSpec[] {
  let kept = edits as { from: number; to: number; insert: string }[];
  const nestable = new Map<number, boolean>();
  for (const edit of kept) {
    const context = resolveLineIndentContext(state, state.doc.lineAt(edit.from));
    if (context.kind === 'list') {
      nestable.set(edit.from, hasItemToNestUnder(state, context.markerFrom));
    }
  }
  if (nestable.size === 0) {
    return edits;
  }

  for (;;) {
    const changeSet = state.changes(kept);
    // Grammar only, like `planOrderedListNormalization`'s own provisional state: the real state's transaction
    // filters must not run on a document that is only ever read.
    const provisional = EditorState.create({
      doc: changeSet.apply(state.doc),
      extensions: [markdownLanguageExtension()],
    });
    ensureSyntaxTree(provisional, provisional.doc.length, 5000);
    const stopsBeingAListItem = (edit: { from: number }) =>
      nestable.has(edit.from) &&
      resolveLineIndentContext(provisional, provisional.doc.lineAt(changeSet.mapPos(edit.from, -1))).kind !== 'list';
    // The first item (in document order) with nothing to nest under goes first, and everything is judged again
    // without it: with `- A` and `- B` selected, both read as code together, but once A is left alone B nests under
    // it and stays a list item. One at a time, so a parent is settled before the children that moved with it.
    const stuck = kept.filter((edit) => stopsBeingAListItem(edit) && !nestable.get(edit.from));
    const first = stuck.length ? Math.min(...stuck.map((edit) => edit.from)) : -1;
    let next = kept.filter((edit) => edit.from !== first);
    if (next.length === kept.length) {
      // Only items that do have something above them remain: they are dropped only if the edit makes them code.
      next = kept.filter(
        (edit) =>
          !(
            stopsBeingAListItem(edit) &&
            resolveLineIndentContext(provisional, provisional.doc.lineAt(changeSet.mapPos(edit.from, -1))).kind === 'code'
          )
      );
    }
    if (next.length === kept.length) {
      return kept;
    }
    kept = next;
  }
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

    const edits = direction === 1 ? dropEditsThatEndAListItem(state, changes) : changes;

    if (edits.length) {
      // Phase C/D (docs/list-item-architecture-odr.md §16.8, §20):
      // `planOrderedListNormalization` never influences the whitespace
      // change above — it only ever *reads* it (as opaque `{from,to,
      // insert}` data) to find which lines were touched, reparses a
      // throwaway provisional state to see whether any touched line's
      // own `OrderedList` membership genuinely changed, and — only then —
      // plans the digit-run rewrites needed to keep both the list it left
      // and the list it joined internally consistent. Composed into the
      // *same* `edits` array so the whitespace edit and any numbering
      // fix-up dispatch as one transaction, one undo step, exactly like
      // every other list-editing fix in this codebase.
      const normalizeEdits = planOrderedListNormalization(state, edits);
      const allChanges = normalizeEdits.length ? [...edits, ...normalizeEdits] : edits;
      const changeSet = state.changes(allChanges);
      dispatch(
        state.update({
          changes: allChanges,
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
          // correct and is left untouched. Mapped through `changeSet`
          // (the *combined* whitespace + normalization changes), not just
          // the whitespace-only `changes` array, so the caret still lands
          // correctly on the rare press whose own line got renumbered too.
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
