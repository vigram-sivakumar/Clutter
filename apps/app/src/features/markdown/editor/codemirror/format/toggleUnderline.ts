import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange, type StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

const OPEN = '<u>';
const CLOSE = '</u>';

/** The only blocks that take underline: a top-level paragraph or a heading. Anything nested in a list, quote or table, or any other block, does not. */
const HEADINGS: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

/** Inline constructs that are not plain text: underline never wraps or enters them. */
const EXCLUDED_INLINE: ReadonlySet<string> = new Set([
  'InlineCode',
  'WikiLink',
  'Link',
  'Autolink',
  'URL',
  'BareDomain',
  'Image',
  'Embed',
  'Tag',
  'Date',
]);

/** Inline formatting that has its own markers: a piece of text must start and end on the same side of them. */
const CONTAINERS: ReadonlySet<string> = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough', 'Highlight']);

interface Span {
  readonly from: number;
  readonly to: number;
}

interface UnderlineNode extends Span {
  /** The text between the tags. */
  readonly contentFrom: number;
  readonly contentTo: number;
}

function isTopLevelBlock(node: SyntaxNode): boolean {
  return (node.name === 'Paragraph' || HEADINGS.has(node.name)) && node.parent?.name === 'Document';
}

/**
 * The supported block (top-level paragraph or heading) that holds `pos`, or null anywhere else. A position on a
 * block's very edge (the end of the document, say) can resolve to the block or to what is around it, so the preferred
 * side is tried first and the other as a fallback.
 */
function supportedBlockAt(state: EditorState, pos: number, side: -1 | 1): SyntaxNode | null {
  for (const s of [side, side === 1 ? -1 : 1] as const) {
    for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, s); node; node = node.parent) {
      if (isTopLevelBlock(node)) {
        return node;
      }
    }
  }
  return null;
}

/**
 * The span of a block's own text: a heading without its `#` markers (and a Setext heading without its `===`/`---`
 * line), a paragraph as it is. This is the only text underline may wrap.
 */
function blockContent(state: EditorState, block: SyntaxNode): Span | null {
  if (block.name === 'Paragraph') {
    return { from: block.from, to: block.to };
  }
  const marks = block.getChildren('HeaderMark');
  let from = block.from;
  let to = block.to;
  if (block.name.startsWith('ATX')) {
    if (marks[0]) {
      from = marks[0].to;
    }
    if (marks.length > 1) {
      to = marks[marks.length - 1]!.from;
    }
  } else if (marks[0]) {
    to = marks[marks.length - 1]!.from;
  }
  const text = state.sliceDoc(from, to);
  const start = from + (text.length - text.trimStart().length);
  const end = to - (text.length - text.trimEnd().length);
  return end > start ? { from: start, to: end } : null;
}

/** Whether `[from, to]` touches an excluded inline construct: strictly inside one for a caret, overlapping it for a selection. */
function touchesExcludedInline(state: EditorState, from: number, to: number): boolean {
  let found = false;
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (found) {
        return false;
      }
      if (EXCLUDED_INLINE.has(node.name) && (from === to ? node.from < from && from < node.to : node.from < to && node.to > from)) {
        found = true;
      }
      return !found;
    },
  });
  return found;
}

/**
 * The part of `[from, to]` that underline may take, or null when it may not be applied at all: both ends in the same
 * top-level paragraph or heading, the text clipped to that block's own text (so a whole heading line selected
 * from its `#`, or a Setext heading with its underline row, gives just the title), and nothing excluded — code, a
 * wiki link, a link, an image or embed, a tag or date — inside it. A caret must already sit in the block's text.
 * The one place this rule lives; the command below is its only caller, so the shortcut, any toolbar action and any
 * future style selector all go through it.
 */
export function underlineTargetAt(state: EditorState, from: number, to: number): Span | null {
  const block = supportedBlockAt(state, from, 1);
  if (!block || supportedBlockAt(state, to, -1)?.from !== block.from) {
    return null;
  }
  const content = blockContent(state, block);
  if (!content) {
    return null;
  }
  const target = from === to ? { from, to } : { from: Math.max(from, content.from), to: Math.min(to, content.to) };
  if (target.from < content.from || target.to > content.to || (from !== to && target.to <= target.from)) {
    return null;
  }
  return touchesExcludedInline(state, target.from, target.to) ? null : target;
}

function underlineNodes(state: EditorState, from: number, to: number): UnderlineNode[] {
  const found: UnderlineNode[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== 'Underline') {
        return;
      }
      const open = node.node.firstChild;
      const close = node.node.lastChild;
      if (open && close && open !== close) {
        found.push({ from: node.from, to: node.to, contentFrom: open.to, contentTo: close.from });
      }
    },
  });
  return found;
}

function subtract(piece: Span, excluded: Span): Span[] {
  if (excluded.to <= piece.from || excluded.from >= piece.to) {
    return [piece];
  }
  const rest: Span[] = [];
  if (excluded.from > piece.from) {
    rest.push({ from: piece.from, to: excluded.from });
  }
  if (excluded.to < piece.to) {
    rest.push({ from: excluded.to, to: piece.to });
  }
  return rest;
}

/**
 * Cuts a piece wherever it starts or ends inside bold, italic, strikethrough or highlight without also ending or
 * starting in it, and drops that construct's own markers: `**a[b** c]` becomes `b` (inside the bold) and ` c` (after
 * it), so each `<u>…</u>` pair sits on one side of the markers and the result still parses as nested formatting.
 */
function splitAtContainers(state: EditorState, piece: Span): Span[] {
  const excluded: Span[] = [];
  syntaxTree(state).iterate({
    from: piece.from,
    to: piece.to,
    enter: (node) => {
      if (!CONTAINERS.has(node.name)) {
        return;
      }
      const startsInside = node.from < piece.from && piece.from < node.to;
      const endsInside = node.from < piece.to && piece.to < node.to;
      if (startsInside === endsInside) {
        return;
      }
      const marks = node.node.getChildren(`${node.name === 'StrongEmphasis' ? 'Emphasis' : node.name}Mark`);
      const contentFrom = marks[0]?.to ?? node.from;
      const contentTo = marks[marks.length - 1]?.from ?? node.to;
      excluded.push(startsInside ? { from: contentTo, to: node.to } : { from: node.from, to: contentFrom });
    },
  });
  return excluded
    .reduce<Span[]>((pieces, cut) => pieces.flatMap((p) => subtract(p, cut)), [piece])
    .filter((p) => p.to > p.from);
}

/**
 * Moves a position that falls inside bold, italic, strikethrough or highlight *within* the underline out to that
 * construct's outer edge (`side` -1: its start, 1: its end), so splitting the underline never leaves one of the
 * construct's own markers on each side of a tag. Constructs that enclose the underline are left alone.
 */
function outOfInnerFormatting(state: EditorState, u: UnderlineNode, pos: number, side: -1 | 1): number {
  let moved = pos;
  syntaxTree(state).iterate({
    from: u.contentFrom,
    to: u.contentTo,
    enter: (node) => {
      if (CONTAINERS.has(node.name) && node.from >= u.contentFrom && node.to <= u.contentTo && node.from < moved && moved < node.to) {
        moved = side < 0 ? node.from : node.to;
      }
    },
  });
  return moved;
}

/** Grows the piece to take in every underline it touches, so partly underlined text becomes one underline. */
function absorbUnderlines(piece: Span, underlines: readonly UnderlineNode[]): Span {
  let { from, to } = piece;
  for (const u of underlines) {
    if (u.contentFrom < to && u.contentTo > from) {
      from = Math.min(from, u.contentFrom);
      to = Math.max(to, u.contentTo);
    }
  }
  return { from, to };
}

function toggleRange(state: EditorState, range: SelectionRange) {
  const target = underlineTargetAt(state, range.from, range.to);
  if (!target) {
    return { changes: [] as ChangeSpec[], range };
  }
  const { from, to } = target;

  if (from === to) {
    // An empty `<u></u>` with the caret between the tags: toggles it away. Anywhere else: an empty pair to type into.
    if (state.sliceDoc(from - OPEN.length, from + CLOSE.length) === OPEN + CLOSE) {
      return { changes: [{ from: from - OPEN.length, to: from + CLOSE.length }], range: EditorSelection.cursor(from - OPEN.length) };
    }
    return { changes: [{ from, insert: OPEN + CLOSE }], range: EditorSelection.cursor(from + OPEN.length) };
  }

  const underlines = underlineNodes(state, from, to);
  const changes: ChangeSpec[] = [];
  // The whole selection lies inside underlined text (tags included, so a selection that takes the tags in counts).
  if (underlines.some((u) => u.from <= from && to <= u.to)) {
    for (const u of underlines.filter((x) => x.from <= from && to <= x.to)) {
      const a = outOfInnerFormatting(state, u, Math.max(from, u.contentFrom), -1);
      const b = outOfInnerFormatting(state, u, Math.min(to, u.contentTo), 1);
      changes.push(a <= u.contentFrom ? { from: u.from, to: u.contentFrom } : { from: a, insert: CLOSE });
      changes.push(b >= u.contentTo ? { from: u.contentTo, to: u.to } : { from: b, insert: OPEN });
    }
  } else {
    const piece = absorbUnderlines({ from, to }, underlines);
    for (const u of underlines) {
      if (u.contentFrom < piece.to && u.contentTo > piece.from) {
        changes.push({ from: u.from, to: u.contentFrom }, { from: u.contentTo, to: u.to });
      }
    }
    for (const part of splitAtContainers(state, piece)) {
      changes.push({ from: part.from, insert: OPEN }, { from: part.to, insert: CLOSE });
    }
  }

  const set = state.changes(changes);
  return { changes: set, range: EditorSelection.range(set.mapPos(from, 1), set.mapPos(to, -1)) };
}

/**
 * Cmd/Ctrl-U — underline, stored as the inline HTML `<u>text</u>` (see `underlineSyntax.ts`).
 *
 * Only ordinary text: a top-level paragraph or a heading (H1–H6), decided by the syntax tree (`underlineAllowedAt`).
 * Anywhere else — inside a list, quote, table, task, code block, horizontal rule — and on anything that is not plain
 * text — inline code, a wiki link, a link or its destination, an image or embed, a tag or date — the command does
 * nothing: the document, the selection and the history are left untouched, and the key is still consumed (so it never
 * falls through to another binding). A selection that crosses into another block, or into one of those constructs, is
 * refused whole rather than partly applied.
 *
 * Within a supported block it works on the tree, not on string replacement:
 * - all of the selection underlined → the underline comes off (the whole `<u>…</u>`, or only the selected part, which
 *   splits it);
 * - partly underlined → one underline over the whole selection, absorbing the old tags;
 * - a selection that starts or ends inside bold, italic, strikethrough or highlight is cut at that construct's
 *   markers, so the tags always nest correctly;
 * - an empty selection inserts an empty `<u></u>` with the caret between the tags, the way Bold does, and removes an
 *   empty pair the caret is already inside.
 */
export const toggleUnderline: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => toggleRange(state, range));
  if (!changes.changes.empty) {
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
  }
  return true;
};
