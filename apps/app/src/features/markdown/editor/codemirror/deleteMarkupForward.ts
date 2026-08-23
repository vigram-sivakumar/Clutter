import { syntaxTree } from '@codemirror/language';
import { Prec, type Extension, type StateCommand } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Delete's cross-block-boundary awareness — the gap Milestone 1's
 * `listDeleteKeymap.ts` doesn't touch, per the implementation plan's own
 * scoping: `@codemirror/lang-markdown` ships zero forward-delete commands
 * at all (confirmed by direct inspection of the installed package —
 * `deleteMarkupBackward`/`insertNewlineContinueMarkup` are the *only* two
 * exported commands), so Delete falls all the way through to
 * `@codemirror/commands`' bare `deleteCharForward` at every position,
 * with zero Markdown structure awareness anywhere in the stack.
 *
 * Confirmed narrow in scope, by direct behavior investigation (see the
 * D1–D8 case-by-case analysis this milestone was built from): the danger
 * is specifically *cross-boundary* — Delete positioned anywhere inside an
 * already-open construct (right after `- `, `# `, `> `, an opening code
 * fence) is already safe today, since deleting there just edits ordinary
 * text within one node. Destruction only happens when the cursor sits at
 * the very end of one block's own content and the immediately following
 * line begins a different block — a plain paragraph absorbs a following
 * list/heading, a `ListItem`'s own marker is silently destroyed by a
 * sibling join, a heading swallows a following block's content wholesale,
 * or a blockquote silently annexes unrelated following text.
 *
 * Product decision (§2(d) item 2 in the implementation plan): **refuse
 * and no-op**, not merge. A behavior-only analysis of every D1–D8 case
 * found that "merge, preserving one side's markup" is only well-defined
 * when the absorbed side carries no markup of its own (a plain
 * paragraph) — the moment either side owns real structural markup (a
 * `ListItem`'s marker, a heading's single-line-ness), every concrete
 * reading of "merge" either reproduces today's exact bug or is
 * structurally impossible under CommonMark's grammar (a `ListItem` node
 * has exactly one marker by construction; there is no legal tree where
 * two list items' text merges while both keep independent markers).
 * Refuse/no-op, by contrast, behaves identically and unambiguously across
 * every case — the only one of the two options that needs no
 * case-by-case exception. Mirrors `dedentListItem`'s own established
 * "no valid target → no-op, still consumed" contract
 * (`list/listIndentKeymap.ts`) and `listDeleteKeymap.ts`'s own B11
 * refusal, rather than inventing a new contract shape.
 *
 * Deliberately construct-agnostic rather than an enumerated list of
 * node-name pairs: the trigger is purely structural — does *some*
 * recognized block node end exactly at the cursor, and does *some*
 * recognized block node begin exactly at the very next line. This is
 * what correctly refuses D1 (paragraph→list), D2 (list item→list item),
 * D4 (heading→paragraph), D5 (heading→list), and D7 (nested-list sibling
 * join), while correctly staying silent for D9–D12 (cursor mid-construct,
 * not at a block's own end) and for ordinary same-block line-wrapping (a
 * multi-line paragraph's second line is never itself a node's own
 * `.from`/`.to` boundary, regardless of what inline construct — even a
 * `WikiLink`/emphasis — that second line happens to start with).
 *
 * D3 (list→paragraph) and D8 (blockquote→paragraph) are deliberately
 * NOT in the refused set, despite being named in the original test
 * matrix — direct tree inspection of their exact documented inputs shows
 * the "paragraph" side is already lazily continuing the preceding block's
 * own `Paragraph` node *before* any Delete press (CommonMark's lazy
 * continuation applies inside both list items and blockquotes: an
 * unindented, non-block-starting line immediately following, with no
 * blank line between, continues the enclosing paragraph regardless of
 * the container's own prefix). There is no genuine block boundary in the
 * tree for either case — Delete there only removes a newline within an
 * already-continuous node, the same category as ordinary same-paragraph
 * line-wrapping, which must stay on `deleteCharForward`. See
 * `deleteMarkupForward.test.ts`'s own D3/D8 tests for the direct tree
 * evidence.
 */

/**
 * Node names this command treats as "a real block, worth protecting its
 * boundary" — deliberately the exact set demonstrated by the D1–D8
 * evidence (paragraphs, ATX headings, and list/blockquote structure), not
 * a speculative superset. `ListMark`/`HeaderMark`/`QuoteMark`/`CodeMark`
 * (the marker nodes themselves) are deliberately excluded — they exist
 * *inside* their owning block and would otherwise cause a false match at
 * a within-construct cursor position (D9–D12), which must stay on the
 * unmodified `deleteCharForward` path.
 */
const BLOCK_NODE_NAMES: ReadonlySet<string> = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'ListItem',
  'BulletList',
  'OrderedList',
  'Blockquote',
]);

/**
 * Whether some recognized block node's own range ends exactly at `pos` —
 * walking from the innermost node containing `pos` outward, stopping as
 * soon as an ancestor's `.to` no longer equals `pos` (once that happens,
 * no further ancestor can equal it either, since containment is
 * monotonic). A marker node (e.g. `ListMark`) ending at `pos` does not
 * count — its own ancestors don't end there too (the owning block
 * extends well past its marker), so the loop naturally terminates before
 * ever reaching a recognized name.
 */
function blockEndsAt(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  let node: SyntaxNode | null = tree.resolveInner(pos, -1);
  for (; node && node.to === pos; node = node.parent) {
    if (BLOCK_NODE_NAMES.has(node.name)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether some recognized block node's own range begins exactly at
 * `pos` — the mirror of {@link blockEndsAt}, walking outward while
 * `.from === pos` holds. This is what distinguishes "the next line
 * genuinely starts a new block" (a `ListItem`'s `ListMark` and the
 * `ListItem` itself share the same `.from`, so the walk reaches
 * `ListItem` and matches) from "the next line is just more content of
 * the block already being edited" (an ordinary paragraph continuation,
 * even one starting with an inline construct like emphasis or a
 * `WikiLink` — that construct's own block ancestor, the continuing
 * `Paragraph`, started on an *earlier* line, so its `.from` is strictly
 * less than `pos` and the walk terminates before ever reaching it).
 */
function blockStartsAt(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);
  for (; node && node.from === pos; node = node.parent) {
    if (BLOCK_NODE_NAMES.has(node.name)) {
      return true;
    }
  }
  return false;
}

export const deleteMarkupForward: StateCommand = ({ state }) => {
  const range = state.selection.main;
  if (!range.empty) {
    return false;
  }

  const pos = range.from;
  const { doc } = state;
  const line = doc.lineAt(pos);
  if (pos !== line.to || line.number >= doc.lines) {
    return false;
  }

  const nextLine = doc.line(line.number + 1);
  // A new block's own node never begins at a raw, possibly-indented
  // line's `.from` — an indented item's leading whitespace belongs to no
  // syntax node at all (the same "unclaimed gap" `listIndentKeymap.ts`'s
  // own `owningListItem` doc comment describes), so the probe must land
  // on the first non-whitespace character, exactly where the marker
  // itself actually starts (confirmed empirically: D7's nested sibling
  // otherwise went undetected).
  const nextLineContentStart = nextLine.from + (nextLine.text.length - nextLine.text.trimStart().length);
  const tree = syntaxTree(state);

  if (blockEndsAt(tree, pos) && blockStartsAt(tree, nextLineContentStart)) {
    // Refuse and no-op — consume the keystroke without dispatching any
    // change, per the §2(d) item 2 product decision.
    return true;
  }

  return false;
};

export function deleteMarkupForwardKeymap(): Extension {
  return Prec.high(keymap.of([{ key: 'Delete', run: deleteMarkupForward }]));
}
