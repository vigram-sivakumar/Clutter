import { syntaxTree } from '@codemirror/language';
import type { ChangeSpec, EditorState, StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * Tab/Shift-Tab list indent/dedent — the one piece of "smart list
 * continuation" not already delivered by `@codemirror/lang-markdown`'s own
 * `markdownKeymap` (Enter-continues, empty-item-exits — confirmed already
 * active via `markdown()`'s default `addKeymap: true`, see
 * `docs/editor-feature-matrix.md`).
 *
 * The unit of movement is a `ListItem`'s own syntax-tree subtree — never a
 * physical line. A Lezer `ListItem` node's `[from, to)` range already
 * spans every descendant (nested lists, continuation lines, everything),
 * confirmed by direct inspection of the parsed tree: the same containment
 * property `listLineDecoration.ts`'s own depth calculation already relies
 * on. Because CommonMark list nesting is purely column-based, shifting
 * every non-blank physical line inside that range by one identical
 * leading-space delta preserves every existing parent/child relationship
 * inside the subtree exactly, by construction — there is no need to walk
 * or re-derive descendant structure separately from the delta application
 * itself.
 *
 * Both commands are deliberately scoped to list context only, exported as
 * plain `StateCommand`s rather than a bound keymap — `markdownTabKeymap.ts`
 * is the one place Tab/Shift-Tab actually get registered, chaining this
 * module's commands ahead of the paragraph command so structural list
 * ownership always wins over generic paragraph indentation.
 */

const LIST_MARKER_NODE_NAMES: ReadonlySet<string> = new Set(['ListMark', 'EmojiListMark']);

/**
 * The `ListItem` that owns a given document line — whichever `ListItem`'s
 * range contains that line's first non-whitespace character. Deliberately
 * a single, unified resolution used both to decide "is this line list
 * context at all" and to find the actual movement target: a continuation
 * line (no marker of its own on this line) and a nested item's own marker
 * line resolve through the exact same call, so there is no separate
 * per-case fallback for continuation lines — whatever `ListItem` a line's
 * content structurally belongs to is what Tab/Shift-Tab operate on for
 * that line, full stop.
 *
 * Probes at the line's first non-whitespace character, never raw
 * `line.from` — a nested item's own indentation belongs to no syntax node
 * at all (confirmed by direct inspection of the parsed tree), so probing
 * at column 0 can only ever land on a *shallower* ancestor whose range
 * happens to span that unclaimed gap, never the line's own deepest owning
 * item.
 */
export function owningListItem(state: EditorState, linePos: number): SyntaxNode | null {
  const line = state.doc.lineAt(linePos);
  const probePos = line.from + leadingSpaceCount(line.text);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (node.name === 'ListItem') {
      return node;
    }
  }
  return null;
}

/**
 * The column (from the start of `listItem`'s own line) where that item's
 * *content* begins — the exact target column a child needs to reach to be
 * recognized as nested inside it, per `@lezer/markdown`'s own
 * `getListIndent`/`DefaultSkipMarkup[ListItem]` rules. Derived from where
 * `listItem`'s actual marker node ends in the real document — never a
 * hardcoded "2 for bullets, 3 for ordered" table, so a `10.`/`100.` marker
 * (or a marker with unusual extra spacing) is handled correctly by
 * construction, not by enumerating cases.
 */
export function contentColumn(state: EditorState, listItem: SyntaxNode): number {
  const markerLine = state.doc.lineAt(listItem.from);
  const marker = listItem.firstChild;
  if (!marker || !LIST_MARKER_NODE_NAMES.has(marker.name)) {
    // Defensive only — every real ListItem's firstChild is one of these;
    // falling back to "right after the item's own start" keeps this from
    // silently no-oping if that invariant ever changes upstream.
    return listItem.from - markerLine.from + 1;
  }
  const contentFrom = marker.nextSibling ? marker.nextSibling.from : marker.to + 1;
  return contentFrom - markerLine.from;
}

export function leadingSpaceCount(lineText: string): number {
  return lineText.length - lineText.trimStart().length;
}

/** The nearest ancestor `ListItem` that `node` is nested *inside* — one level up. */
export function enclosingListItem(node: SyntaxNode): SyntaxNode | null {
  for (let n = node.parent; n; n = n.parent) {
    if (n.name === 'ListItem') {
      return n;
    }
  }
  return null;
}

/**
 * Every distinct document line touched by the current selection, deduped
 * by start position — a multi-line selection indents/dedents every line
 * it spans. Exported for `paragraphIndentKeymap.ts`, which needs the same
 * "which lines does this selection touch" primitive for its own,
 * independent context check — not a shared indentation concept, just the
 * one small pure helper both commands happen to need.
 */
export function selectedLines(state: EditorState): { from: number; text: string }[] {
  const lines = new Map<number, { from: number; text: string }>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const line = state.doc.line(lineNumber);
      lines.set(line.from, { from: line.from, text: line.text });
    }
  }
  return [...lines.values()];
}

/**
 * Reduces a set of candidate owning `ListItem`s (one per selected line,
 * per `owningListItem`) to the minimal set of independent subtree roots:
 * the syntax tree determines structural ownership, selection only
 * determines which roots are *requested*. A candidate is dropped whenever
 * another candidate's range strictly contains it — i.e. it's already
 * inside a subtree another selected line also resolved to — so a
 * selection spanning a parent and any of its own descendants (whether all
 * of them or only part of one) always collapses to operating on the
 * parent's complete subtree exactly once, never stranding or
 * double-moving a descendant. Compared by `.from` rather than object
 * identity: separate `resolveInner` calls are not guaranteed to return
 * reference-equal nodes for the same tree position.
 */
function dedupeToRoots(items: readonly SyntaxNode[]): SyntaxNode[] {
  const byStart = new Map<number, SyntaxNode>();
  for (const item of items) {
    byStart.set(item.from, item);
  }
  const candidates = [...byStart.values()];
  return candidates.filter(
    (item) => !candidates.some((other) => other.from !== item.from && other.from <= item.from && other.to >= item.to)
  );
}

/** The physical line range spanned by `item`'s own node range — its complete subtree. */
export function subtreeLineRange(state: EditorState, item: SyntaxNode): { startLine: number; endLine: number } {
  const startLine = state.doc.lineAt(item.from).number;
  const endLine = state.doc.lineAt(Math.max(item.from, item.to - 1)).number;
  return { startLine, endLine };
}

/**
 * Every line-start change needed to shift `item`'s whole subtree by
 * `delta` columns — positive inserts, negative removes, applied
 * uniformly to every non-blank physical line in the subtree's range.
 * Blank lines are skipped entirely (nothing to hang whitespace off of on
 * insert; nothing meaningful to remove on outdent). Removal is clamped
 * per line to that line's own actual leading whitespace — always
 * sufficient for a well-formed nested subtree, since every line inside it
 * must already indent at least as far as the root's own content column,
 * but clamped defensively rather than assumed.
 */
export function changesForDelta(state: EditorState, item: SyntaxNode, delta: number): ChangeSpec[] {
  const { startLine, endLine } = subtreeLineRange(state, item);
  const changes: ChangeSpec[] = [];
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim() === '') {
      continue;
    }
    if (delta > 0) {
      changes.push({ from: line.from, insert: ' '.repeat(delta) });
    } else {
      const removable = Math.min(-delta, leadingSpaceCount(line.text));
      if (removable > 0) {
        changes.push({ from: line.from, to: line.from + removable });
      }
    }
  }
  return changes;
}

/**
 * Resolves every selected line to its owning `ListItem` and reduces that
 * to the minimal independent root set — shared by both commands below.
 * Returns `null` (not "no roots") when any touched line has no owning
 * `ListItem` at all: that means the selection isn't cleanly list context
 * (either entirely outside a list, or a mix of list and non-list lines),
 * so neither command claims it — matching the existing "every touched
 * line must qualify" gate rather than acting on a partial selection.
 */
function resolveRoots(state: EditorState): SyntaxNode[] | null {
  const lines = selectedLines(state);
  if (lines.length === 0) {
    return null;
  }
  const owners: (SyntaxNode | null)[] = lines.map((line) => owningListItem(state, line.from));
  if (owners.some((owner) => owner === null)) {
    return null;
  }
  return dedupeToRoots(owners as SyntaxNode[]);
}

/**
 * Tab nests each selected root under its own immediately preceding
 * sibling `ListItem` — inserting exactly enough leading spaces to reach
 * that sibling's content column (`contentColumn`), applied to the root's
 * *entire* subtree (`changesForDelta`) so descendants move with it and
 * their own relative indentation is preserved exactly.
 *
 * A root with no preceding sibling at its own level is left untouched —
 * there is nothing valid to nest it under. Once any touched line resolves
 * to list context at all (`resolveRoots` returns non-null), this command
 * always returns `true` — even when every root turns out unable to
 * indent — so Tab is always consumed inside a list and CM6 never lets the
 * browser's native focus navigation run (the mechanism that otherwise
 * moves focus onto a task checkbox's real `<button>` widget when no
 * extension handles the key).
 */
export const indentListItem: StateCommand = ({ state, dispatch }) => {
  const roots = resolveRoots(state);
  if (roots === null) {
    return false;
  }

  const changes = roots.flatMap((root) => {
    const prevSibling = root.prevSibling;
    if (!prevSibling || prevSibling.name !== 'ListItem') {
      return [];
    }
    const targetColumn = contentColumn(state, prevSibling);
    const rootLine = state.doc.lineAt(root.from);
    const needed = targetColumn - leadingSpaceCount(rootLine.text);
    if (needed <= 0) {
      return [];
    }
    return changesForDelta(state, root, needed);
  });

  if (changes.length > 0) {
    dispatch(state.update({ changes, userEvent: 'input.indent.list' }));
  }
  return true;
};

/**
 * Shift-Tab removes exactly the indentation `indentListItem` would have
 * added to reach the current level, applied to each selected root's
 * entire subtree, restoring it to its enclosing item's own sibling
 * column — the current item's *grandparent's* `contentColumn` (0 with no
 * grandparent).
 *
 * Same always-consumed contract as `indentListItem`: once any touched
 * line is list context at all, this returns `true` regardless of whether
 * any root could actually outdent (e.g. already at top level).
 */
/**
 * The number of columns `root` would need to lose to sit at its enclosing
 * item's own sibling level (its parent's parent's content column, or 0
 * with no grandparent) — `null` when `root` has no enclosing `ListItem` at
 * all (already top-level, nothing to dedent to) or is already at/above
 * that target. Shared by {@link dedentListItem} (Tab/Shift-Tab) and
 * `listDeleteKeymap.ts`'s Backspace subtree-dedent supplement, which needs
 * the identical "promote this item and its subtree by one level" delta —
 * factored out once both needed it, per `implementation-rules.md` rule 4.
 */
export function dedentDeltaFor(state: EditorState, root: SyntaxNode): number | null {
  const parentItem = enclosingListItem(root);
  if (!parentItem) {
    return null;
  }
  const grandparentItem = enclosingListItem(parentItem);
  const targetColumn = grandparentItem ? contentColumn(state, grandparentItem) : 0;
  const rootLine = state.doc.lineAt(root.from);
  const removable = leadingSpaceCount(rootLine.text) - targetColumn;
  return removable > 0 ? removable : null;
}

export const dedentListItem: StateCommand = ({ state, dispatch }) => {
  const roots = resolveRoots(state);
  if (roots === null) {
    return false;
  }

  const changes = roots.flatMap((root) => {
    const removable = dedentDeltaFor(state, root);
    if (removable === null) {
      return [];
    }
    return changesForDelta(state, root, -removable);
  });

  if (changes.length > 0) {
    dispatch(state.update({ changes, userEvent: 'delete.dedent.list' }));
  }
  return true;
};
