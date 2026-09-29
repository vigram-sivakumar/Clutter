import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState, Text, type Extension } from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';

import { markdownLanguageExtension } from '../markdownLanguage';
import { isListItemNode } from './listMarkerDecoration';

/**
 * Fixes a real, confirmed regression: pasting a normal paragraph at a
 * position immediately after an unordered list, ordered list, or task —
 * with **no blank line already separating them** — lands as a genuine
 * CommonMark *lazy continuation* of the preceding `ListItem`, not a new
 * top-level paragraph. `listLineDecoration.ts` then correctly renders
 * `cm-list-line`/`--list-indent-px` for it, because the pasted text really
 * is, structurally, part of that `ListItem` in the parsed tree.
 *
 * **This is not a decoration bug, and it is not solved by touching
 * decoration.** Confirmed directly, twice: once by reading the Lezer tree
 * before/after such a paste (`ListItem` grows to include the pasted
 * `Paragraph` as a second child), and once by reproducing the exact
 * reported DOM live in the browser with the reporter's own text, with no
 * leading whitespace anywhere in the pasted content — ruling out a prior,
 * narrower whitespace-based theory. `listLineDecoration.ts`,
 * `nearestListItem()`, `ownListItemIndentPx()`, and `.cm-list-line`'s CSS
 * are all left completely untouched by this fix — they are correctly
 * reporting real document structure; the structure itself is what this
 * fixes.
 *
 * **Why this is a paste-specific fix, not an Enter-keymap extension**:
 * investigated `markdownEnterKeymap.ts` first, per this fix's own
 *"extend existing structural logic before adding a new mechanism"
 * mandate. Enter's own list handling is entirely
 * `@codemirror/lang-markdown`'s upstream `insertNewlineContinueMarkupCommand`
 * (`continueMarkup` in that file) — Clutter adds no list-specific Enter
 * logic of its own. Critically, exiting a *tight* list's empty trailing
 * item via Enter is already locked, tested behavior
 * (`markdownEnterKeymap.test.ts`: `'- one\n- |'` + Enter → `'- one\n|'`)
 * that does **not** insert a blank-line paragraph boundary — it merges
 * the cursor right back to a lazy-continuation-eligible position, one
 * more Enter press away from a real blank line. There is no existing
 * "create a real paragraph boundary after a list" structural command to
 * extend; Enter's own behavior here is deliberately unrelated to what
 * paste needs, so this is necessarily a new, narrowly-scoped mechanism —
 * exactly the shape the investigation was asked to rule out first.
 *
 * **The fix**: when a paste lands at the very start of a line, and that
 * position would (per a real, complete re-parse) resolve inside a
 * `ListItem` purely because no blank line precedes it, insert exactly one
 * blank line immediately before the pasted content — never after, never
 * touching the pasted text itself — so the *document structure* genuinely
 * changes: `List → ListItem → Paragraph, Paragraph` (lazy continuation)
 * becomes `List → ListItem → Paragraph` followed by a sibling top-level
 * `Paragraph`. This is the same "insert a blank line before the pasted
 * text" outcome the product discussion explicitly accepted, implemented
 * as the smallest structural nudge that produces it.
 *
 * **Deliberately narrow — this is not a general paste-normalization
 * layer**: it only ever inserts one `\n`, only at a paste's own insertion
 * point, only when a real re-parse confirms doing so removes the
 * `ListItem` membership that would otherwise exist. It never strips or
 * rewrites the pasted text itself (a separate, narrower
 * leading-whitespace variant of this problem exists and was deliberately
 * left unaddressed here — no evidence tying it to the actual reported
 * workarounds this fix targets). A paste landing well away from any list,
 * or one that would remain part of a `ListItem` even with a blank line
 * inserted (a genuinely indented, intentional continuation), is left
 * completely untouched.
 */

/** The nearest enclosing `ListItem` ancestor at `pos`, or `null` — the identical walk `listLineDecoration.ts`'s own `nearestListItem()` performs, reimplemented here (rather than imported) so that file stays completely untouched by this fix. */
function nearestListItemAt(tree: Tree, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  for (; node; node = node.parent) {
    if (isListItemNode(node.name)) {
      return node;
    }
  }
  return null;
}

function completeTree(state: EditorState): Tree {
  ensureSyntaxTree(state, state.doc.length, 5000);
  return syntaxTree(state);
}

/** A `Text` of exactly one blank line — `Text.of(['', ''])` is `@codemirror/state`'s own documented way to represent a single `\n` as a `Text` value (two empty lines joined by one line break). */
const ONE_BLANK_LINE = Text.of(['', '']);

export function pasteListExitBoundary(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent('input.paste')) {
      return tr;
    }

    const insertions: number[] = [];

    tr.changes.iterChanges((_fromA, _toA, fromB, _toB, inserted) => {
      if (inserted.length === 0) {
        return;
      }

      // Only a paste landing at the very start of a resulting line is "a
      // new paragraph on its own line" — the shape this fix addresses.
      const line = tr.state.doc.lineAt(fromB);
      if (line.from !== fromB) {
        return;
      }

      // As actually pasted: does this position land inside a real
      // ListItem? If not, this paste has nothing to do with a list.
      const withoutBoundary = nearestListItemAt(completeTree(tr.state), fromB);
      if (!withoutBoundary) {
        return;
      }

      // Would inserting one blank line right before this position remove
      // it from that ListItem? Only then is "no blank line yet" actually
      // the cause — build a throwaway state with only the Markdown
      // grammar (matching `orderedListStructuralNormalization.ts`'s own
      // provisional-state pattern) so this never re-invokes this filter.
      const withBoundaryDoc = tr.state.doc
        .slice(0, fromB)
        .append(ONE_BLANK_LINE)
        .append(tr.state.doc.slice(fromB));
      const provisional = EditorState.create({
        doc: withBoundaryDoc,
        extensions: [markdownLanguageExtension()],
      });
      const withBoundary = nearestListItemAt(completeTree(provisional), fromB + 1);
      if (withBoundary) {
        return;
      }

      insertions.push(fromB);
    });

    if (insertions.length === 0) {
      return tr;
    }
    return [
      tr,
      { changes: insertions.map((at) => ({ from: at, to: at, insert: '\n' })), sequential: true },
    ];
  });
}
