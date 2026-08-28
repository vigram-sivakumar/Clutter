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
} from '@codemirror/state';
import { keymap } from '@codemirror/view';

import { resolveLineIndentContext } from '../indent/markdownIndentContext';

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
 * The single Enter binding. Exported for tests; wire it through
 * `markdownEnterKeymap()`, never as a second Enter binding of its own.
 * Returning false delegates to whatever sits below — in the real editor,
 * `defaultKeymap`'s `insertNewlineAndIndent`.
 */
export const markdownEnterCommand: StateCommand = (target) =>
  exitEmptyBlockquoteContinuation(target) ||
  continueMarkup(target) ||
  exitEmptyIndentContinuation(target);

/**
 * Finds the `ListMark` node for a `list`-classified line, given the
 * `markerFrom` `resolveLineIndentContext` already resolved for it. Mirrors
 * that function's own internal walk (`ListItem`'s `firstChild`) rather
 * than importing anything private from it — `resolveLineIndentContext`
 * intentionally exposes only the classification (`kind`/`markerFrom`),
 * never node identity, since Tab/Shift-Tab (its only other caller) never
 * needs more than an offset. This function needs the actual node to read
 * its parent (bullet vs. ordered) and its next sibling (the boundary this
 * command cares about) — a different concern from line classification,
 * not a duplication of it.
 */
function bulletListMarkAt(state: EditorState, markerFrom: number): SyntaxNode | null {
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
 * Clutter's own Backspace policy at a bullet list item's marker/separator
 * boundary. Two shapes, both source-local and both resolved purely from
 * the current tree/cursor position — never from what command last ran:
 *
 * - **Non-empty item** (`- |Text`): removes only the separator
 *   whitespace, leaving the marker intact — `-|Text` — regardless of
 *   separator width (`-   |Text` collapses to `-|Text` in one press) and
 *   regardless of list position (first/later/nested all identical).
 * - **Empty item** (`- |` with nothing following the marker at all):
 *   removes the marker *and* its separator together, in one press —
 *   `- |` → `|` (blank line) — rather than leaving a bare marker behind.
 *   Locked product decision (2026-08-28): a bare marker (`-`) is
 *   rendered by `listMarkerDecoration.ts` as the exact same glyph as a
 *   marker that still has a concealed separator after it (both collapse
 *   to one `Decoration.replace` widget), so a bare-marker end state is
 *   visually indistinguishable from "nothing happened yet" — the empty
 *   case removes the whole construct instead, matching the same
 *   principle from the other direction: never leave state on screen that
 *   looks identical to a different, unintended state.
 *
 * Both shapes replace CM6's own `deleteMarkupBackward` behavior at this
 * one position (verified via `node_modules/@codemirror/lang-markdown`,
 * empirically for top-level/non-first/nested items): CM6 blanks a later
 * item's marker to matching-width spaces and fully deletes a first
 * item's — both are replaced here by one pair of uniform rules keyed
 * only on "does content follow the marker," never on list position.
 *
 * Leading indentation is untouched in both shapes — the deleted range
 * never starts before `marker.from` (empty case) or `marker.to`
 * (non-empty case), so indentation belonging to the line/container
 * (everything before the marker itself) is never part of what either
 * branch removes.
 *
 * Verified against the installed `@lezer/markdown` grammar: the
 * resulting `-Text` (non-empty case) does not parse as a list construct
 * at all — CommonMark requires at least one separator space after a
 * bullet marker with content following it — while the resulting blank
 * line (empty case) is simply not a `ListItem` any more, by construction
 * (nothing of the marker remains). Both are the intended, parser-driven
 * consequence of the smallest source edit this command performs; it does
 * not decide, repair, or compensate for the resulting structure. No
 * rendering change is needed or was made: bullet rendering is keyed
 * entirely off the parser's own `ListMark` node, so it stops being drawn
 * on its own once the parser stops emitting one.
 *
 * Deliberately excludes:
 * - **Ordered lists** (`1.`/`1)`) — a separate, not-yet-made product
 *   decision (see the investigation this command's commit reports);
 *   `deleteMarkupBackward` continues to handle them unchanged.
 * - **Any non-collapsed selection or multi-range selection** — this is a
 *   single-cursor, single-position rule; everything else is `false`.
 *
 * Every other Backspace press (before the marker, mid-separator, inside
 * content, on ordered lists, on paragraphs/blockquotes/code, or on any
 * selection) returns `false` and reaches `deleteMarkupBackward` exactly
 * as before.
 */
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

  const marker = bulletListMarkAt(state, context.markerFrom);
  if (!marker || marker.parent?.parent?.name !== 'BulletList') {
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

  dispatch(
    state.update({
      changes: { from, to: boundary },
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
 * documented at the top of this file, and Backspace is CM6's own
 * `deleteMarkupBackward` with exactly one narrower rule shadowing it first
 * (`deleteBulletMarkerSeparator`, documented above its definition).
 * Anything using `markdownLanguageExtension()` for real editing must wire
 * this alongside it, or it gets no Markdown-aware Enter or Backspace at
 * all.
 */
export function markdownEnterKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: markdownEnterCommand },
      {
        key: 'Backspace',
        run: (target) => deleteBulletMarkerSeparator(target) || deleteMarkupBackward(target),
      },
    ])
  );
}
