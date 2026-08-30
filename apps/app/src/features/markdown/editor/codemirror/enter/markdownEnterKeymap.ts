import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import { getIndentUnit, indentString, syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  countColumn,
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type StateCommand,
  type Transaction,
} from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { resolveLineIndentContext } from '../indent/markdownIndentContext';
import { classifyMarkerText, firstSameLineListMark } from '../list/listMarkerDecoration';
import { insertOrderedListMarkerSeparator } from '../list/orderedListMarkerCreation';
import { isRiskyRenumberRewrite, renumberSequentialTail } from '../list/orderedListRenumbering';

/**
 * The one Markdown editing policy Clutter adds on top of CodeMirror:
 *
 *     CONTENT + Enter            -> continue the Markdown structure (CM6)
 *     EMPTY CONTINUATION + Enter -> remove one structural level of
 *                                   continuation markup/indentation
 *     NORMAL LINE + Enter        -> plain newline (CM6)
 *
 * "One structural level" is deliberate: an empty nested item unwinds to its
 * parent level, an empty `>>` line drops to `>`, and an empty item inside a
 * quote drops to the bare quote — never straight to column 0. That matches
 * `@codemirror/lang-markdown`'s own model (and Obsidian/Typora), and is the
 * only way to leave a nested construct without destroying its parent.
 *
 * Almost all of this is CM6's already. Measured against
 * `@codemirror/lang-markdown@6.5.2`, exactly three gaps exist:
 *
 * 1. Lists (ordered, bullet, `*`/`+`, task lists, nested, mixed) — CM6
 *    implements the desired policy *behind a flag*: on the blank second item
 *    of a tight list the default command inserts a blank line and keeps the
 *    marker (making the list non-tight) instead of removing the marker, and
 *    only clears it on a third press. `nonTightLists: false` is upstream's
 *    own switch for precisely that; from the third item on, the default
 *    already behaves this way. The flag touches *only* that branch — a
 *    genuinely non-tight list still gets its blank line before a new item.
 *    So: configure the command, do not reimplement list parsing,
 *    renumbering, or task-list normalization.
 * 2. Blockquotes — the default exits a quote only after two blank quoted
 *    lines (`> Text` / `>` / `> |`), by design (see the package CHANGELOG).
 *    `deleteMarkupBackward`, CM6's own Backspace command, already performs
 *    the exact single-press collapse we want, so the handler below detects
 *    the case and delegates to it rather than writing quote-prefix deletion.
 * 3. Indentation-only continuation lines — `insertNewlineContinueMarkup`
 *    returns false for these, so they fall through to `insertNewlineAndIndent`,
 *    which re-indents the fresh line every press and therefore never
 *    converges on an unindented line. This is the only case with no CM6
 *    primitive at all, and the only place below that edits the document
 *    directly.
 *
 * Both custom handlers are strictly narrower than CM6's own command: they
 * fire only on an empty continuation line and return false otherwise, so
 * every other Enter press reaches exactly the code that handled it before.
 */

/** CM6's Markdown Enter command, configured per gap (1) above. */
const continueMarkup = insertNewlineContinueMarkupCommand({
  nonTightLists: false,
});

/** A line whose text before the cursor is nothing but blockquote markup. */
const QUOTE_MARKUP_ONLY = /^[ \t]*>[ \t>]*$/;

interface EmptyContinuation {
  readonly pos: number;
  readonly lineFrom: number;
  /** Line text before the cursor — the candidate continuation markup. */
  readonly before: string;
}

/**
 * The shared guard: a single collapsed cursor sitting on a Markdown line
 * with nothing but whitespace after it, outside fenced code. Returns null
 * (meaning "not our case, let CM6 have it") for everything else.
 *
 * Fenced code is excluded explicitly rather than via `isActiveAt`: with no
 * `codeLanguages` configured, a fence's contents are not reparsed into
 * another language, so Markdown is still "active" inside one.
 * `getContext` in lang-markdown bails on `FencedCode` for the same reason.
 * Indented code blocks are deliberately *not* excluded — an indentation-only
 * line inside one is precisely case (3).
 */
function emptyContinuationAt(state: EditorState): EmptyContinuation | null {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return null;
  }

  const pos = selection.main.head;
  if (
    !markdownLanguage.isActiveAt(state, pos, -1) &&
    !markdownLanguage.isActiveAt(state, pos, 1)
  ) {
    return null;
  }

  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const after = line.text.slice(pos - line.from);
  if (/\S/.test(after) || hasAncestor(state, pos, 'FencedCode')) {
    return null;
  }

  return { pos, lineFrom: line.from, before };
}

function hasAncestor(state: EditorState, pos: number, name: string): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (node.name === name) {
      return true;
    }
  }
  return false;
}

/**
 * Empty blockquote continuation (`> Text` / `> |`, `>> Text` / `>> |`,
 * `> - Text` / `> |`): drop one quote level.
 *
 * Delegates to `deleteMarkupBackward`, which handles the common shapes in a
 * single call. It declines in one measured case — a quote-only line directly
 * below a *quoted list* item (`> - Text` / `> |`), where its context
 * resolves to the list on the line above and neither of its branches
 * applies — so we then remove the innermost `>` level ourselves. That
 * fallback deletes exactly what the delegate would have: from the last `>`
 * on this line to the cursor, one level, never the whole prefix.
 */
const exitEmptyBlockquoteContinuation: StateCommand = (target) => {
  const context = emptyContinuationAt(target.state);
  if (
    !context ||
    !QUOTE_MARKUP_ONLY.test(context.before) ||
    !hasAncestor(target.state, context.pos, 'Blockquote')
  ) {
    return false;
  }

  if (deleteMarkupBackward(target)) {
    return true;
  }

  const from = context.lineFrom + context.before.lastIndexOf('>');
  if (from >= context.pos) {
    return false;
  }

  target.dispatch(
    target.state.update({
      changes: { from, to: context.pos },
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: 'delete',
    })
  );
  return true;
};

/**
 * Indentation-only continuation (`    Text` / `    |`): remove one
 * indentation unit, not the whole leading-whitespace run — repeated Enter
 * presses step down to column 0 the same way `indentLess` (Shift-Tab) steps
 * up, one unit per press, before falling through to a genuinely empty line.
 *
 * Reuses `indentLess`'s own column math (`countColumn`, `getIndentUnit`,
 * `indentString`) rather than a bespoke calculation, so this stays in sync
 * with whatever `indentUnit`/`tabSize` the editor is actually configured
 * with — but never calls `indentLess`/`indentMore`/`indentWithTab`
 * themselves, and never touches their keybindings; those commands operate
 * over the full selection across every selected line, which is broader than
 * this single-line, empty-continuation case.
 *
 * Ordered last in the chain, so it can only ever see presses CM6's own
 * Markdown command has already declined. That ordering is what keeps it
 * narrow: any indentation that belongs to a list or quote context is
 * consumed upstream and never reaches here.
 */
const exitEmptyIndentContinuation: StateCommand = (target) => {
  const context = emptyContinuationAt(target.state);
  if (
    !context ||
    context.before.length === 0 ||
    /[^ \t]/.test(context.before)
  ) {
    return false;
  }

  const { state } = target;
  const column = countColumn(context.before, state.tabSize);
  const insert = indentString(state, Math.max(0, column - getIndentUnit(state)));

  target.dispatch(
    state.update({
      changes: { from: context.lineFrom, to: context.pos, insert },
      selection: EditorSelection.cursor(context.lineFrom + insert.length),
      scrollIntoView: true,
      userEvent: 'delete',
    })
  );
  return true;
};

/**
 * A physical line's own leading whitespace, followed by a bullet or
 * ordered marker and its separator — the raw *shape* CM6's own
 * `getContext` has declined to recognize as this line's own marker (see
 * the guard below). Never used to decide list *structure*; only to detect
 * this one fallback case.
 *
 * Ordered markers included (2026-08-29, ordered-list extension): the root
 * cause below (a line indented 4+ columns past the nearest open block's
 * own content column becomes lazy-continuation text) is a generic
 * CommonMark indentation rule, not specific to which marker character the
 * line happens to start with — confirmed by the same reasoning already
 * established for bullets, re-applied here rather than re-derived.
 */
const LIST_MARKER_LOOKALIKE = /^([ \t]*)(?:[-+*][ \t]+|\d{1,9}[.)][ \t]+)/;

/**
 * Fallback for Enter on a physical line that *looks* like a bullet item
 * but that CM6's own `getContext` doesn't recognize as one — verified
 * (see the investigation this command's commit reports) to be a genuine
 * CommonMark parser consequence, not a bug: a line indented 4+ columns
 * past the nearest currently-open block's own content column becomes
 * that block's lazy-continuation text, regardless of whether the line's
 * own characters happen to start with a bullet marker. `getContext`'s
 * ancestor walk then finds only the *shallower* real `ListItem` (if any)
 * enclosing that paragraph, and `continueMarkup` reconstructs the new
 * line at that shallower item's own indentation — discarding the deeper
 * physical line's own position entirely.
 *
 * This command intercepts exactly that one shape, before `continueMarkup`
 * runs, and inserts a newline plus the *physical line's own* leading
 * whitespace — nothing else. No marker is repeated: this line was never
 * a real `ListItem` in the parser's eyes, and inventing one here would be
 * Clutter deciding list structure the parser itself doesn't recognize,
 * exactly what this architecture forbids elsewhere (Tab/Shift-Tab,
 * Backspace). The result is a plain, unindented-relative-to-itself
 * continuation line — matching what pressing Enter inside any ordinary
 * indented paragraph text does elsewhere in this editor.
 *
 * Guard, all five required to fire:
 * 1. Single collapsed cursor (mirrors `emptyContinuationAt`'s own guard).
 * 2. Markdown active at the cursor.
 * 3. Cursor is at the exact end of the current physical line (`pos ===
 *    line.to`) — narrows this to precisely the case every product
 *    example and test describes; a cursor sitting earlier on the line
 *    (e.g. inside its own leading whitespace, before the lookalike
 *    prefix even starts) never triggers this fallback and instead
 *    reaches whatever already handles a mid-line Enter today.
 * 4. The physical line's text matches `LIST_MARKER_LOOKALIKE` — leading
 *    whitespace, then one of `-`/`+`/`*` or an ordered marker (`\d{1,9}[.)]`),
 *    then real separator whitespace.
 * 5. `resolveLineIndentContext` classifies *this exact line* as
 *    `'paragraph'` — never `'list'` (a real, recognized `ListItem`'s own
 *    line — case A/B, untouched, `continueMarkup` already does the right
 *    thing), `'code'` (a fenced code line that merely contains this text
 *    as content — must never be treated as markup), `'heading'`, or
 *    `'unhandled'` (blockquotes — `>` never matches `LIST_MARKER_LOOKALIKE`
 *    anyway — and blank lines).
 *
 * Every other case returns `false` and reaches `continueMarkup` exactly
 * as before.
 */
export const exitLazyContinuationBulletLookalike: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  if (
    !markdownLanguage.isActiveAt(state, pos, -1) &&
    !markdownLanguage.isActiveAt(state, pos, 1)
  ) {
    return false;
  }

  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return false;
  }

  const match = LIST_MARKER_LOOKALIKE.exec(line.text);
  if (!match) {
    return false;
  }

  if (resolveLineIndentContext(state, line).kind !== 'paragraph') {
    return false;
  }

  const indent = match[1] ?? '';
  let from = pos;
  while (from > line.from && /[ \t]/.test(line.text.charAt(from - line.from - 1))) {
    from--;
  }

  dispatch(
    state.update({
      changes: { from, to: pos, insert: state.lineBreak + indent },
      selection: EditorSelection.cursor(from + state.lineBreak.length + indent.length),
      scrollIntoView: true,
      userEvent: 'input',
    })
  );
  return true;
};

/**
 * Continues the *first* same-line marker, not the deepest, at end-of-line
 * on a CommonMark same-line-collapsed chain (`- - - - Text`, `1. 1. 1.
 * Text`, or a chain mixing both kinds, e.g. `- 1. - Text`).
 *
 * Root cause this works around: `- - - - Text` is a genuinely valid parse
 * — each `- ` after the first is an empty list item whose own content is
 * *another* list, four levels deep, all on one physical line (confirmed
 * against the installed parser; see this session's own investigation).
 * `listMarkerDecoration.ts`'s "first `ListMark` per physical line" render
 * rule visually collapses that to one marker, but
 * `insertNewlineContinueMarkupCommand`'s own `getContext` walk has no
 * concept of physical lines at all — it collects every `ListItem`
 * ancestor regardless of which line it starts on and always continues the
 * *last* (deepest) one, so Enter here produced a heavily-indented new
 * marker at the invisible 4th level, matching nothing on screen. Confirmed
 * (2026-08-29, ordered-list extension) that the identical ambiguity
 * reproduces across marker kinds, not just within one — `"1. 1. 1. Text"`
 * and `"- 1. - Text"` are both genuinely nested, same-line parses too.
 *
 * `firstSameLineListMark` (`listMarkerDecoration.ts`) is the exact same
 * "first marker per line" fact already governing rendering — kind-agnostic
 * since the same 2026-08-29 extension, so this command needs no bullet/
 * ordered distinction of its own — queried for this one cursor position,
 * reused, not re-derived. It returns `null` for a genuine, different-line-
 * nested item (Parent/Child) or a plain single-level item, so this command
 * only ever fires on the specific same-line-collapsed shape it exists for.
 *
 * Guard, all required to fire:
 * 1. Single collapsed cursor (mirrors every sibling command's own guard).
 * 2. Cursor is at the exact end of the physical line — narrows this to
 *    the one reported shape; a mid-line Enter (splitting text) falls
 *    through to `continueMarkup`'s own default splitting behavior instead
 *    of this command attempting to replicate it for a rare case.
 * 3. `firstSameLineListMark` finds a real same-line-collapsed marker.
 *
 * When all three hold, this is a pure *insertion* at the cursor — no
 * deletion — of a newline, the first marker's own real leading
 * indentation, and a byte-for-byte copy of its own marker+separator text
 * (whatever the marker's own characters and separator width actually are —
 * this command never assumes bullet-shaped or single-space, it copies
 * whatever `firstSameLineListMark` found verbatim). The original line is
 * never modified. Every other case (mid-line Enter, no same-line collapse,
 * genuine multi-line nesting, single-level lists) returns `false` and
 * reaches `continueMarkup` exactly as before.
 */
const continueFirstSameLineListLevel: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  if (pos !== line.to) {
    return false;
  }

  const first = firstSameLineListMark(state, pos);
  if (!first) {
    return false;
  }

  const indent = state.sliceDoc(line.from, first.from);
  const markerAndSeparator = state.sliceDoc(first.from, first.to);
  const insert = state.lineBreak + indent + markerAndSeparator;

  dispatch(
    state.update({
      changes: { from: pos, to: pos, insert },
      selection: EditorSelection.cursor(pos + insert.length),
      scrollIntoView: true,
      userEvent: 'input',
    })
  );
  return true;
};

/**
 * Preserves the complete `marker + separator` (e.g. `"- "`/`"1. "`) on the
 * *original* line when Enter splits a list item exactly at content-start
 * (`- |Text`/`1. |Text`).
 *
 * Root cause this works around: `insertNewlineContinueMarkupCommand`
 * (`@codemirror/lang-markdown`) computes the *new* line's marker correctly,
 * but derives the deleted range's `from` by walking backward over any
 * whitespace immediately before the cursor — which, at content-start, is
 * exactly the marker's own separator. The resulting change deletes that
 * separator and never re-emits it on the old line, so `- Text` becomes
 * `-` / `- Text` instead of `- ` / `- Text`. Confirmed this is entirely
 * upstream and decoration-independent: identical with `listMarkerDecoration()`
 * present, absent, and under a from-scratch `Decoration.mark` probe — see
 * `listMarkerDecoration.ts`'s own doc comment for that investigation.
 * Confirmed (2026-08-29, ordered-list extension) that the identical bug
 * reproduces for ordered markers: `insertNewlineContinueMarkupCommand`
 * against `"1. |Text"` produces `"1.\n2. Text"` — the original line's own
 * separator eaten (`"1."`, no trailing space) *and* the split-off content
 * silently renumbered to `2.` even though nothing about a content-start
 * split should invent a new number. This command's own fix (copy the
 * marker+separator verbatim, never compute a new number) is deliberately
 * **not** symmetric with `continueMarkup`'s own untouched end-of-line
 * behavior (§ ODR "Ordered-list numbering" — plain `- Text|` + Enter *does*
 * let CM6 auto-increment the new line to the previous item's number + 1,
 * which this file does not touch or reimplement): a content-start split is
 * not "continuing the list with a new entry," it's dividing one line's
 * existing marker between two lines, so the correct number for *both*
 * resulting lines is the one the user actually typed, copied verbatim —
 * inventing an incremented number here would silently author content the
 * user didn't type, which is exactly what this whole architecture's
 * source-preservation principle forbids.
 *
 * Guard, all required to fire:
 * 1. Single collapsed cursor (mirrors every sibling command's own guard).
 * 2. Cursor's nearest `ListItem` ancestor exists, and its `firstChild` is a
 *    `ListMark` matching `classifyMarkerText` (bullet or ordered; task
 *    items are separately excluded — this only inspects a `ListItem`'s own
 *    `ListMark` text, which is never itself a `TaskMarker`).
 * 3. A real, same-physical-line, whitespace-only separator exists after
 *    the marker (never crossing into a nested list starting on a later
 *    line — the same boundary `separatorRangeAfter` in
 *    `listMarkerDecoration.ts` already establishes).
 * 4. The cursor sits exactly at content-start (`separator.to`) — not
 *    before the marker, not mid-marker, not mid-word, not at end-of-line.
 * 5. Real (non-whitespace) content actually follows on this line — an
 *    empty item (`- |` with nothing after) is `continueMarkup`'s own
 *    "exit the list" gesture, untouched here.
 *
 * When all five hold, this dispatches a pure *insertion* — no deletion at
 * all — of `"\n" + indent + marker + separator` at the cursor. The
 * original line's own `marker + separator` is never part of the change,
 * so it survives completely untouched; the new line gets an identical,
 * freshly-written copy of the same indent/marker/separator. Every other
 * case (before the marker, mid-marker, mid-word, end-of-line, empty item,
 * non-list constructs) returns `false` and reaches `continueMarkup`
 * exactly as before.
 */
const preserveListMarkerOnContentStartSplit: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  let listItem: SyntaxNode | null = null;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'ListItem') {
      listItem = node;
      break;
    }
  }
  if (!listItem) {
    return false;
  }

  const marker = listItem.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return false;
  }

  const markerText = state.sliceDoc(marker.from, marker.to);
  if (!classifyMarkerText(markerText)) {
    return false;
  }

  const line = state.doc.lineAt(pos);
  const separatorFrom = marker.to;
  const nextSibling = marker.nextSibling;
  const separatorTo = Math.min(nextSibling ? nextSibling.from : separatorFrom + 1, line.to, state.doc.length);
  if (separatorTo <= separatorFrom) {
    return false;
  }

  const gap = state.sliceDoc(separatorFrom, separatorTo);
  if (gap.trim() !== '') {
    return false;
  }

  if (pos !== separatorTo) {
    return false;
  }

  if (!/\S/.test(state.doc.sliceString(separatorTo, line.to))) {
    return false;
  }

  const indent = state.sliceDoc(line.from, marker.from);
  const insert = state.lineBreak + indent + markerText + gap;

  dispatch(
    state.update({
      changes: { from: pos, to: pos, insert },
      selection: EditorSelection.cursor(pos + insert.length),
      scrollIntoView: true,
      userEvent: 'input',
    })
  );
  return true;
};

/**
 * `isRiskyRenumberRewrite` and `renumberSequentialTail` moved to the
 * neutral `../list/orderedListRenumbering` module (2026-08-30, Tab/
 * Shift-Tab numbering normalization) — Tab/Shift-Tab's own membership-
 * change normalizer needs the identical width-safety check and sibling-
 * shift walk this file already built for Enter/Backspace, and per
 * explicit product decision this file should not be the owner of
 * functionality three different commands now share. Both are imported
 * above, unchanged in behavior — see that module for their full
 * documentation; docs/list-item-architecture-odr.md §15/§19/§20 still
 * record the original reasoning and evidence.
 */

/**
 * Guards `continueMarkup`'s own upstream ordered-list renumbering
 * (`renumberList`, `@codemirror/lang-markdown`) against a confirmed
 * structural-corruption defect — recorded in full in
 * docs/list-item-architecture-odr.md §15, not re-derived here:
 * renumbering a sibling's digit run to keep a sequence consistent is a
 * pure text rewrite with zero awareness of that sibling's own descendant
 * content. When the rewrite changes the digit run's *width* — crossing
 * `9`→`10`, `99`→`100`, `999`→`1000`, or simply stripping a leading-
 * zero-padded marker's own padding (`"008."`→`"9."`, confirmed live:
 * `renumberList` converts through a bare `Number`, which never
 * round-trips zero-padding) — the sibling's own content column shifts,
 * and any already-correctly-nested child whose indentation was
 * calibrated to the *old* width falls out of that item's tolerance
 * window on the next reparse: either flattened into a top-level sibling
 * `ListItem` (the new indentation now reads as CommonMark's own 0-3-
 * space "new marker" tolerance) or silently absorbed as lazy-
 * continuation text of the renumbered item's own paragraph (the new
 * indentation now lands in neither-sibling-nor-nested territory — this
 * document's own §14.9 already measured and named that same gap for a
 * different, Tab-driven case). Confirmed live against the installed
 * `@codemirror/lang-markdown@6.5.2`/`@lezer/markdown@1.7.2`: `"8.
 * A\n9. B\n   1. Child"` + Enter at the end of `A` renumbers `"9."`→
 * `"10."` and destroys the nested list under `B`.
 *
 * This does **not** reimplement, replace, or second-guess
 * `renumberList` — it only inspects the transaction `continueMarkup`
 * *already computed* and would have dispatched unchanged, and drops
 * *only* the specific renumbering edits that would corrupt structure —
 * every other edit in the same transaction, including a later, otherwise-
 * unrelated sibling's own safe renumber that happens to come after a
 * declined one in document order, is kept byte-identical to what
 * upstream produced. This was verified, not assumed: an earlier version
 * of this guard truncated *every* edit from the first risky one onward,
 * which silently left later, independently-safe siblings un-renumbered
 * too (confirmed via direct transaction inspection — `9. A / 9. B[risky]
 * / 10. C[safe] / 11. D[safe]` — the risky-only version keeps C and D's
 * own correct renumbers; the truncating version dropped them for no
 * reason, which is exactly the "more aggressive than necessary" failure
 * mode this design explicitly avoids). Each renumbering edit targets an
 * independent, non-overlapping digit-run position, and upstream's own
 * `renumberList` already computes every rewritten value from each
 * sibling's own *original* literal number (not from any other rewrite in
 * the same walk) — so declining one specific rewrite has no bearing on
 * whether any other rewrite in the same transaction remains correct on
 * its own.
 *
 * Every case that doesn't hit this specific hazard (the overwhelming
 * majority: no ordered-list renumbering at all, or renumbering that
 * never crosses a digit-width boundary, or a boundary crossing where the
 * affected item has no descendant content to break) dispatches exactly
 * as `continueMarkup` alone would — nothing about this wrapper changes
 * any already-correct Enter behavior, and it never touches Tab/Shift-Tab
 * or Backspace.
 *
 * Declining a would-be-corrupting rewrite leaves that one item
 * numerically out of sequence rather than structurally broken —
 * deliberately: this document's own standing principle (§1, §7, §13.6)
 * is "never silently author a document shape the user didn't ask for,"
 * and a non-sequential number is a far smaller, purely cosmetic
 * consequence than a destroyed nested list. This wrapper does not
 * attempt to *repair* the resulting gap (e.g. by compensating
 * whitespace) — that would be exactly the kind of new, invented editing
 * behavior this codebase's Tab/Enter architecture treats as requiring
 * its own deliberate design pass (see the ordered-list-normalization
 * addendum tracked in §9/§14), not something to fold into a narrow
 * corruption guard.
 */
const continueMarkupPreservingStructure: StateCommand = ({ state, dispatch }) => {
  let captured: Transaction | null = null;
  const handled = continueMarkup({
    state,
    dispatch: (tr) => {
      captured = tr;
    },
  });
  if (!handled || !captured) {
    return handled;
  }

  const transaction: Transaction = captured;
  const kept: { from: number; to: number; insert: string }[] = [];
  let declinedAny = false;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (isRiskyRenumberRewrite(state, fromA, toA, inserted.length)) {
      declinedAny = true;
      return;
    }
    kept.push({ from: fromA, to: toA, insert: inserted.toString() });
  }, true);

  if (!declinedAny) {
    dispatch(transaction);
    return true;
  }

  dispatch(
    state.update({
      changes: kept,
      selection: EditorSelection.cursor(transaction.state.selection.main.head),
      scrollIntoView: true,
      userEvent: 'input',
    })
  );
  return true;
};

/**
 * The single Enter binding. Exported for tests; wire it through
 * `markdownEnterKeymap()`, never as a second Enter binding of its own.
 * Returning false delegates to whatever sits below — in the real editor,
 * `defaultKeymap`'s `insertNewlineAndIndent`.
 */
export const markdownEnterCommand: StateCommand = (target) =>
  exitEmptyBlockquoteContinuation(target) ||
  exitLazyContinuationBulletLookalike(target) ||
  preserveListMarkerOnContentStartSplit(target) ||
  continueFirstSameLineListLevel(target) ||
  continueMarkupPreservingStructure(target) ||
  exitEmptyIndentContinuation(target);

/**
 * Finds the `ListMark` node for a `list`-classified line, given the
 * `markerFrom` `resolveLineIndentContext` already resolved for it. Mirrors
 * that function's own internal walk (`ListItem`'s `firstChild`) rather
 * than importing anything private from it — `resolveLineIndentContext`
 * intentionally exposes only the classification (`kind`/`markerFrom`),
 * never node identity, since Tab/Shift-Tab (its only other caller) never
 * needs more than an offset. This function needs the actual node to read
 * its parent (`BulletList` vs. `OrderedList`) and its next sibling (the
 * boundary this command cares about) — a different concern from line
 * classification, not a duplication of it.
 */
function listMarkAt(state: EditorState, markerFrom: number): SyntaxNode | null {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(markerFrom, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'ListItem') {
      const marker = node.firstChild;
      return marker && marker.name === 'ListMark' ? marker : null;
    }
  }
  return null;
}

/**
 * Clutter's own Backspace policy at a list item's marker/separator
 * boundary — bullet or ordered alike (2026-08-29, ordered-list extension;
 * originally bullet-only, see below). Two shapes, both source-local and
 * both resolved purely from the current tree/cursor position — never from
 * what command last ran:
 *
 * - **Non-empty item** (`- |Text`/`1. |Text`): removes only the separator
 *   whitespace, leaving the marker intact — `-|Text`/`1.|Text` —
 *   regardless of separator width (`-   |Text` collapses to `-|Text` in
 *   one press) and regardless of list position (first/later/nested all
 *   identical).
 * - **Empty item** (`- |`/`1. |` with nothing following the marker at
 *   all): removes the marker *and* its separator together, in one press —
 *   `- |` → `|` (blank line) — rather than leaving a bare marker behind.
 *   Locked product decision (2026-08-28, bullets; extended unchanged to
 *   ordered markers 2026-08-29 — the reasoning is marker-shape-agnostic):
 *   a bare marker (`-`/`1.`) is rendered by `listMarkerDecoration.ts` as
 *   the exact same undecorated text as a marker that still has a
 *   concealed separator after it, so a bare-marker end state is visually
 *   indistinguishable from "nothing happened yet" — the empty case
 *   removes the whole construct instead, matching the same principle from
 *   the other direction: never leave state on screen that looks identical
 *   to a different, unintended state.
 *
 * Both shapes replace CM6's own `deleteMarkupBackward` behavior at this
 * one position (verified via `node_modules/@codemirror/lang-markdown`,
 * empirically for top-level/non-first/nested items, both marker kinds):
 * CM6 blanks a later item's marker to matching-width spaces and fully
 * deletes a first item's — both are replaced here by one pair of uniform
 * rules keyed only on "does content follow the marker," never on list
 * position or marker kind.
 *
 * Leading indentation is untouched in both shapes — the deleted range
 * never starts before `marker.from` (empty case) or `marker.to`
 * (non-empty case), so indentation belonging to the line/container
 * (everything before the marker itself) is never part of what either
 * branch removes.
 *
 * Verified against the installed `@lezer/markdown` grammar: the
 * resulting `-Text`/`1.Text` (non-empty case) does not parse as a list
 * construct at all — CommonMark requires at least one separator space
 * after a marker with content following it — while the resulting blank
 * line (empty case) is simply not a `ListItem` any more, by construction
 * (nothing of the marker remains). Both are the intended, parser-driven
 * consequence of the smallest source edit this command performs; it does
 * not decide, repair, or compensate for the resulting structure, and does
 * not renumber any sibling item — no other line is part of this change.
 * No rendering change is needed or was made: list-marker rendering is
 * keyed entirely off the parser's own `ListMark` node, so it stops being
 * drawn on its own once the parser stops emitting one.
 *
 * Why ordered lists are no longer excluded (this was a deliberate,
 * explicitly-recorded not-yet-made decision — see
 * docs/list-item-architecture-odr.md §8): nothing about either shape's
 * reasoning above is bullet-specific — `classifyMarkerText` (shared with
 * `listMarkerDecoration.ts`) accepts either kind, and the marker/parent
 * check below now accepts `OrderedList` alongside `BulletList`.
 *
 * Deliberately excludes:
 * - **Any non-collapsed selection or multi-range selection** — this is a
 *   single-cursor, single-position rule; everything else is `false`.
 *
 * Every other Backspace press (before the marker, mid-separator, inside
 * content, on paragraphs/blockquotes/code, or on any selection) returns
 * `false` and reaches `deleteMarkupBackward` exactly as before.
 */

/**
 * Closes the numbering gap left behind when Backspace deletes one or more
 * empty/whole ordered-list item(s) — matching CM6's own upstream behavior
 * for the *symmetric* case (Enter on an empty item, which already calls
 * `renumberList(inner.item, doc, changes, -2)`). Delegates directly to
 * `renumberSequentialTail` (`../list/orderedListRenumbering`, shared with
 * Tab/Shift-Tab's own numbering normalizer): the departed item(s)' own
 * *last* member seeds the sequential-run check, and every kept sibling
 * shifts down by exactly the departed count (`shift = -deletedItems.length`)
 * — the negative-shift instance of that shared function's general
 * "anchor plus signed shift" shape. See that module for the full
 * reasoning (irregular-sequence preservation, width-safety gating, zero-
 * padding loss); docs/list-item-architecture-odr.md §15/§19/§20 records
 * the original evidence this call site's own behavior is unchanged from.
 */
function renumberAfterEmptyItemDeletion(
  state: EditorState,
  deletedItems: readonly SyntaxNode[]
) {
  return renumberSequentialTail(state, deletedItems[deletedItems.length - 1]!, -deletedItems.length);
}

export const deleteBulletMarkerSeparator: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || !selection.main.empty) {
    return false;
  }

  const pos = selection.main.head;
  const line = state.doc.lineAt(pos);
  const context = resolveLineIndentContext(state, line);
  if (context.kind !== 'list') {
    return false;
  }

  const marker = listMarkAt(state, context.markerFrom);
  const listItem = marker?.parent;
  const listParentName = listItem?.parent?.name;
  if (!marker || (listParentName !== 'BulletList' && listParentName !== 'OrderedList')) {
    return false;
  }

  const content = marker.nextSibling;
  const boundary = content ? content.from : line.to;
  if (pos !== boundary || boundary <= marker.to) {
    return false;
  }

  // Non-empty: remove only the separator, keeping the marker. Empty:
  // remove the marker and its separator together, preserving whatever
  // leading indentation sits before `marker.from`.
  const from = content ? marker.to : marker.from;

  // Empty-item deletion in an OrderedList: close the numbering gap left
  // behind, matching Enter's own symmetric behavior on the same empty
  // item (see `renumberAfterEmptyItemDeletion`'s own doc comment). The
  // non-empty (separator-only) branch is deliberately unaffected — only
  // removing an item can leave a gap to close.
  const renumbers =
    !content && listParentName === 'OrderedList' && listItem
      ? renumberAfterEmptyItemDeletion(state, [listItem])
      : [];

  dispatch(
    state.update({
      changes: [{ from, to: boundary }, ...renumbers],
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: 'delete',
    })
  );
  return true;
};

/**
 * The `ListItem` starting *exactly* at `pos`, or `null` — used only by
 * `exactListItemSelectionRun` below to anchor a selection's `from` to a
 * real item boundary. `resolveInner(pos, 1)` at a position that is a
 * `ListItem`'s own start resolves into that item's `ListMark` (its first
 * child, always co-located with the item's own start), so the first
 * `ListItem` ancestor found while walking up is the item actually
 * starting there — never a shallower one, since any enclosing ancestor
 * necessarily starts at or before `pos`, and this returns as soon as the
 * innermost `ListItem` is reached rather than continuing upward.
 */
function listItemStartingAt(state: EditorState, pos: number): SyntaxNode | null {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'ListItem') {
      return node.from === pos ? node : null;
    }
  }
  return null;
}

/**
 * Whether `[from, to)` is *exactly* one or more complete, consecutive
 * sibling `ListItem`s of the same list — the precondition
 * `deleteCompleteListItemSelection` requires before it will touch
 * anything. Two, and only two, shapes of `to` count as "exact":
 *
 * 1. `to` lands on some item in the run's own `.to` — the selection is
 *    the item(s)' own content only, no trailing line break included.
 * 2. `to` lands exactly on the *next* sibling's `.from` — the selection
 *    also swallows the single line break separating the run from
 *    whatever follows (what a ranged selection from one item's start to
 *    the next item's start naturally produces — e.g. Home, Shift+Down
 *    across item boundaries).
 *
 * Anything else — a selection ending mid-item, mid-nested-content, or
 * spanning into a different list/construct entirely — returns `null`,
 * which is what keeps this from ever touching a partial-content
 * selection: `cur.to`/`next.from` are real tree boundaries, not derived
 * from character counting, so a selection that merely *looks* like it
 * covers whole items but actually clips into one can never accidentally
 * satisfy either check.
 *
 * A gap in the walk (the next node after `from`'s own item isn't a
 * sibling `ListItem` — e.g. the selection would have to cross into a
 * different list or construct to reach `to`) also returns `null` before
 * either check is reached, which is what keeps this from ever crossing
 * into an unrelated list or a different marker kind (§ audit finding:
 * different marker kinds are always separate sibling nodes at the
 * `Document`/container level, never reachable via one `ListItem`'s own
 * `nextSibling` chain, so this is a structural guarantee, not merely an
 * untested assumption).
 */
function exactListItemSelectionRun(
  state: EditorState,
  from: number,
  to: number
): { readonly items: readonly SyntaxNode[]; readonly listParentName: string } | null {
  const firstItem = listItemStartingAt(state, from);
  if (!firstItem) {
    return null;
  }
  const listParentName = firstItem.parent?.name;
  if (listParentName !== 'BulletList' && listParentName !== 'OrderedList') {
    return null;
  }

  const items: SyntaxNode[] = [firstItem];
  let cur = firstItem;
  for (;;) {
    if (cur.to === to) {
      return { items, listParentName };
    }
    const next = cur.nextSibling;
    if (next && next.from === to) {
      return { items, listParentName };
    }
    // `to` isn't a boundary at `cur` yet — only worth continuing the walk
    // if `next` is a sibling `ListItem` that `to` still reaches *past*
    // (`next.from < to`); otherwise `to` either lands strictly inside
    // `cur`'s own range (checked and rejected above) or strictly inside
    // `next`'s (caught on the following iteration's own `cur.to === to`
    // check, since a boundary a further sibling ahead is `>= next.to`).
    if (!next || next.name !== 'ListItem' || next.from > to) {
      return null;
    }
    items.push(next);
    cur = next;
  }
}

/**
 * Backspace/Delete with a non-collapsed selection that exactly covers one
 * or more complete ordered/bullet-list items — the gap
 * `deleteBulletMarkerSeparator` structurally cannot see, since that
 * command (and CM6's own `deleteMarkupBackward`) both require a collapsed
 * cursor. A selection spanning, say, the whole of `"2. B"` (including or
 * excluding its own trailing line break — see `exactListItemSelectionRun`)
 * falls through both of those straight to generic `deleteCharBackward`/
 * `deleteCharForward`, which deletes the range with zero renumbering,
 * reproducing the identical `"1. A / 2. B / 3. C"` → `"1. A / 3. C"` gap
 * the collapsed-cursor case was already fixed for.
 *
 * Deliberately narrow, matching that fix's own scope exactly: fires only
 * when `exactListItemSelectionRun` confirms the selection's `[from, to)`
 * is *precisely* a run of complete sibling items — never a selection that
 * merely overlaps list content. Any other selection (partial content,
 * spanning into a different construct, multi-range) returns `false` and
 * reaches the same fallback chain as before this command existed.
 *
 * One atomic transaction: the item-range deletion and every renumbering
 * rewrite for the surviving siblings after it are dispatched together
 * (`renumberAfterEmptyItemDeletion`, reused unchanged in shape from the
 * collapsed-cursor fix, just given the *whole* deleted run so it can
 * shift survivors down by the run's own length rather than a hardcoded
 * one) — a single undo step restores the pre-deletion document exactly,
 * the same guarantee already verified for the collapsed-cursor case.
 * Bullet runs never renumber (no digits), matching every other call site
 * in this file.
 */
export const deleteCompleteListItemSelection: StateCommand = ({ state, dispatch }) => {
  const { selection } = state;
  if (selection.ranges.length !== 1 || selection.main.empty) {
    return false;
  }

  const { from, to } = selection.main;
  const run = exactListItemSelectionRun(state, from, to);
  if (!run) {
    return false;
  }

  const renumbers =
    run.listParentName === 'OrderedList'
      ? renumberAfterEmptyItemDeletion(state, run.items)
      : [];

  dispatch(
    state.update({
      changes: [{ from, to }, ...renumbers],
      selection: EditorSelection.cursor(from),
      scrollIntoView: true,
      userEvent: 'delete',
    })
  );
  return true;
};

/**
 * Replaces `markdownKeymap`, which `markdownLanguageExtension()` no longer
 * installs (`addKeymap: false`). Same precedence (`Prec.high`) as
 * lang-markdown's own Backspace binding — Enter differs by the policy
 * documented at the top of this file, Backspace is CM6's own
 * `deleteMarkupBackward` with two narrower rules shadowing it first
 * (`deleteBulletMarkerSeparator` for the collapsed-cursor case,
 * `deleteCompleteListItemSelection` for the exact-selection case), and
 * Delete has no CM6 Markdown-specific command of its own to defer to at
 * all — `deleteCompleteListItemSelection` is the only Markdown-aware
 * behavior Delete gets; every other Delete press reaches
 * `defaultKeymap`'s plain `deleteCharForward` exactly as before this
 * binding existed (unaffected: Delete's general lack of Markdown
 * awareness — mid-marker, mid-content, forward-deleting a marker
 * character — remains its own separate, not-yet-scoped future phase, per
 * existing project notes). `Space` is the newest addition (2026-08-30,
 * marker-creation numbering): `insertOrderedListMarkerSeparator`
 * (`../list/orderedListMarkerCreation.ts`) completes a bare ordered
 * marker into a correctly-numbered item when its own Space is the one
 * that creates it, and returns `false` for every other Space press
 * (bullets, mid-content, manual digit edits, anything not shaped exactly
 * like marker-creation), falling through to CM6's ordinary default Space
 * handling unchanged. Anything using `markdownLanguageExtension()` for
 * real editing must wire this alongside it, or it gets no Markdown-aware
 * Enter/Backspace/Delete/Space at all.
 */
export function markdownEnterKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: markdownEnterCommand },
      {
        key: 'Backspace',
        run: (target) =>
          deleteBulletMarkerSeparator(target) ||
          deleteCompleteListItemSelection(target) ||
          deleteMarkupBackward(target),
      },
      { key: 'Delete', run: deleteCompleteListItemSelection },
      { key: 'Space', run: insertOrderedListMarkerSeparator },
    ])
  );
}
