import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import {
  EditorSelection,
  Prec,
  type EditorState,
  type Extension,
  type StateCommand,
} from '@codemirror/state';
import { keymap } from '@codemirror/view';

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
 * Indentation-only continuation (`    Text` / `    |`): remove the
 * indentation, leaving a genuinely empty line. No line break is inserted —
 * the press *undoes* the continuation rather than extending it.
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

  target.dispatch(
    target.state.update({
      changes: { from: context.lineFrom, to: context.pos },
      selection: EditorSelection.cursor(context.lineFrom),
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
 * Replaces `markdownKeymap`, which `markdownLanguageExtension()` no longer
 * installs (`addKeymap: false`). Same precedence (`Prec.high`) and the same
 * Backspace binding lang-markdown itself registered — only Enter differs,
 * and only by the policy documented at the top of this file. Anything using
 * `markdownLanguageExtension()` for real editing must wire this alongside
 * it, or it gets no Markdown-aware Enter or Backspace at all.
 */
export function markdownEnterKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Enter', run: markdownEnterCommand },
      { key: 'Backspace', run: deleteMarkupBackward },
    ])
  );
}
