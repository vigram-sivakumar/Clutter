/**
 * Where a dragged sidebar row would land if it were dropped now — calculation only. Nothing here moves,
 * reorders or persists anything; it turns the pointer position plus the rendered rows into one of three
 * states: no target, "into this folder", or "insert at this boundary of a sibling list".
 *
 * Rows are read from the DOM (`data-drag-*` attributes, present only on rows the Notes tree rendered with
 * drag enabled), which is what keeps the interaction exclusive to the Notes section: a row anywhere else
 * carries no attributes and so can never be a target.
 */

/** Share of a row's height, from each edge, that means "next to this row" rather than "into it". */
export const EDGE_BAND_RATIO = 0.25;

export type DropRegion = 'before' | 'inside' | 'after';

/**
 * Which part of a row the pointer is over, from the row's own rectangle (so it scales with any row
 * height). A row that can contain the dragged item has top/bottom edge bands and a central "inside"
 * band; one that cannot (a note, or a folder that would reject the move) has no central band — the
 * halves are simply before and after.
 */
export function resolveDropRegion(
  rect: { readonly top: number; readonly height: number },
  y: number,
  canContain: boolean
): DropRegion {
  const ratio = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;

  if (!canContain) {
    return ratio < 0.5 ? 'before' : 'after';
  }
  if (ratio < EDGE_BAND_RATIO) {
    return 'before';
  }
  if (ratio > 1 - EDGE_BAND_RATIO) {
    return 'after';
  }
  return 'inside';
}

export interface DragItem {
  readonly kind: 'folder' | 'note';
  readonly id: string;
  /** `null` = the vault root. */
  readonly parentId: string | null;
}

/** A rendered, drag-aware row. */
export interface DragRow extends DragItem {
  readonly element: HTMLElement;
  readonly level: number;
  /** Siblings after this one exist but are hidden behind the list's "N more" row. */
  readonly tailHidden: boolean;
}

export type DropTarget =
  | {
      readonly kind: 'inside';
      readonly folderId: string;
      /** The whole folder row, in viewport coordinates. */
      readonly rect: { top: number; left: number; width: number; height: number };
    }
  | {
      readonly kind: 'insert';
      /** The sibling list the item would join (`null` = the vault root). */
      readonly parentId: string | null;
      readonly edge: 'before' | 'after';
      /** The row the position is relative to — a note or a folder: they share one sibling sequence. */
      readonly rowId: string;
      readonly rowKind: 'folder' | 'note';
      /** The boundary line, in viewport coordinates. */
      readonly line: { y: number; left: number; width: number };
    };

export function sameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === 'inside' && b.kind === 'inside') {
    return (
      a.folderId === b.folderId &&
      a.rect.top === b.rect.top &&
      a.rect.left === b.rect.left &&
      a.rect.width === b.rect.width &&
      a.rect.height === b.rect.height
    );
  }
  if (a.kind === 'insert' && b.kind === 'insert') {
    return (
      a.parentId === b.parentId &&
      a.edge === b.edge &&
      a.rowId === b.rowId &&
      a.rowKind === b.rowKind &&
      a.line.y === b.line.y &&
      a.line.left === b.line.left &&
      a.line.width === b.line.width
    );
  }
  return false;
}

const rowKey = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;

function levelOf(element: HTMLElement): number {
  return Number(element.style.getPropertyValue('--tree-level')) || 0;
}

/** Every drag-aware row currently rendered, in document order. */
export function collectDragRows(root: ParentNode = document): DragRow[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-drag-id]')).map((element) => ({
    element,
    kind: element.dataset.dragKind === 'folder' ? 'folder' : 'note',
    id: element.dataset.dragId!,
    parentId: element.dataset.dragParent ? element.dataset.dragParent : null,
    level: levelOf(element),
    tailHidden: element.dataset.dragTailHidden === 'true',
  }));
}

export interface ResolveDropTargetInput {
  readonly pointer: { readonly x: number; readonly y: number };
  readonly dragged: DragItem;
  readonly rows: readonly DragRow[];
  /**
   * The folder-move rules, asked rather than restated (FolderOperations.canMove). Without it, a dragged
   * folder gets no destination at all: the rules are never guessed.
   */
  readonly canMoveFolderInto?: (folderId: string, destinationFolderId: string | null) => boolean;
  /**
   * Whether `parentId`'s list is ordered by hand. Positions ("before/after this row") are only offered in
   * such a list — in a list sorted another way there is nothing to write them to, and the saved manual order
   * must not be overwritten. (The root has no other mode, so it counts.) Moving INTO a folder is not a
   * position and is unaffected. Absent: every list counts.
   */
  readonly isManualLevel?: (parentId: string | null) => boolean;
}

/** The first rendered element after `row` that is not part of its subtree — the row's visual end. */
function subtreeEnd(row: DragRow): HTMLElement {
  let last = row.element;
  let next = row.element.nextElementSibling as HTMLElement | null;

  while (next && next.classList.contains('entry') && levelOf(next) > row.level) {
    last = next;
    next = next.nextElementSibling as HTMLElement | null;
  }

  return last;
}

/**
 * The row on the other side of `row`'s `before`/`after` boundary within its own list — looking past the
 * subtrees of neighbouring siblings — or `'edge'` when the list ends there.
 */
function neighbourAcross(row: DragRow, region: 'before' | 'after'): HTMLElement | 'edge' {
  let candidate =
    region === 'after'
      ? (subtreeEnd(row).nextElementSibling as HTMLElement | null)
      : (row.element.previousElementSibling as HTMLElement | null);

  if (region === 'before') {
    while (candidate && candidate.classList.contains('entry') && levelOf(candidate) > row.level) {
      candidate = candidate.previousElementSibling as HTMLElement | null;
    }
  }

  if (!candidate || !candidate.classList.contains('entry') || levelOf(candidate) < row.level) {
    return 'edge';
  }

  return candidate;
}

export function resolveDropTarget({ pointer, dragged, rows, canMoveFolderInto, isManualLevel }: ResolveDropTargetInput): DropTarget | null {
  const draggedKey = rowKey(dragged);
  const contains = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y < rect.bottom;
  };

  // May the dragged item end up as a child of `destination` (a folder id, or null for the root)?
  const canJoin = (destination: string | null): boolean => {
    // A note always belongs to a folder: the vault root is never a destination for one, so no position
    // in the root list is ever offered to a note — even a note that happens to sit there today.
    if (dragged.kind === 'note' && destination === null) {
      return false;
    }
    if (destination === dragged.parentId) {
      return true; // reordering where it already is
    }
    return dragged.kind === 'note' ? true : (canMoveFolderInto?.(dragged.id, destination) ?? false);
  };

  /**
   * The insertion position `candidate`'s `edge` stands for, or null when it is not a valid one. A position
   * is in the candidate's own sibling list — never in its children — and notes and folders share that one
   * list, so any note or folder row is an anchor for any dragged item (a note may go between two folders, a
   * folder between two notes). A note is never placed in the root list. Beside the dragged row itself the
   * item would not move, and after the last VISIBLE sibling of a capped list the real position is among
   * hidden rows: neither is drawn.
   */
  const insertTarget = (candidate: DragRow, edge: 'before' | 'after'): DropTarget | null => {
    if (rowKey(candidate) === draggedKey || !canJoin(candidate.parentId) || isManualLevel?.(candidate.parentId) === false) {
      return null;
    }
    if (edge === 'after' && candidate.tailHidden) {
      return null;
    }
    const across = neighbourAcross(candidate, edge);
    if (across !== 'edge') {
      const neighbour = rows.find((other) => other.element === across);
      if (neighbour && rowKey(neighbour) === draggedKey) {
        return null;
      }
    }

    // "After" an expanded folder is after its whole subtree, so the line is drawn there, at the folder's indent.
    const rect = candidate.element.getBoundingClientRect();
    const boundary = (edge === 'after' ? subtreeEnd(candidate) : candidate.element).getBoundingClientRect();
    const indent = parseFloat(getComputedStyle(candidate.element).paddingLeft) || 0;

    return {
      kind: 'insert',
      parentId: candidate.parentId,
      edge,
      rowId: candidate.id,
      rowKind: candidate.kind,
      line: {
        y: edge === 'before' ? rect.top : boundary.bottom,
        left: rect.left + indent,
        width: Math.max(0, rect.right - rect.left - indent),
      },
    };
  };

  /**
   * "After" at the bottom of a subtree can mean several things at once: after the last row's own list, and
   * after each enclosing folder whose rendered subtree ends at that same row. Every valid one is a
   * candidate; the pointer's horizontal position picks among them against their indents — the deepest
   * one whose indent the pointer has reached, so moving left selects the enclosing folder.
   */
  const chooseAfter = (candidates: readonly DragRow[]): DropTarget | null => {
    const valid = candidates
      .map((candidate) => insertTarget(candidate, 'after'))
      .filter((target): target is Extract<DropTarget, { kind: 'insert' }> => target !== null);

    return valid.find((target) => target.line.left <= pointer.x) ?? valid[valid.length - 1] ?? null;
  };

  /** Folders, deepest first, whose rendered subtree ends at `end` — `from` and its enclosing folders. */
  const foldersEndingAt = (from: DragRow, end: HTMLElement): DragRow[] => {
    const enclosing: DragRow[] = [];
    let current = from;

    for (;;) {
      const parent = rows.find((other) => other.kind === 'folder' && other.id === current.parentId);
      if (!parent || subtreeEnd(parent) !== end) {
        return enclosing;
      }
      enclosing.push(parent);
      current = parent;
    }
  };

  const row = rows.find((candidate) => contains(candidate.element));

  // Over a row that cannot be dragged (a file, a capped list's "N more") which is nevertheless where one or
  // more folders' subtrees end: its bottom edge is "after" those folders.
  if (!row) {
    const rowElements = new Set(rows.map((other) => other.element));
    const enders = rows
      .filter((folder) => folder.kind === 'folder')
      .filter((folder) => {
        const end = subtreeEnd(folder);
        return end !== folder.element && !rowElements.has(end) && contains(end);
      })
      .sort((a, b) => b.level - a.level);

    const end = enders[0] && subtreeEnd(enders[0]);
    if (!end || resolveDropRegion(end.getBoundingClientRect(), pointer.y, true) !== 'after') {
      return null;
    }
    return chooseAfter(enders.filter((folder) => subtreeEnd(folder) === end));
  }

  // The dragged row itself is never a target — except that its bottom edge can still be the end of one or
  // more enclosing folders' subtrees (it is their last row): "after" those folders is how the last child
  // of a folder is dragged out of it, with nothing below it to aim at.
  if (rowKey(row) === draggedKey) {
    const end = subtreeEnd(row);
    if (end !== row.element || resolveDropRegion(row.element.getBoundingClientRect(), pointer.y, false) !== 'after') {
      return null;
    }
    return chooseAfter(foldersEndingAt(row, end));
  }

  const rect = row.element.getBoundingClientRect();
  // Into a folder: only a folder, never the item's current parent (a no-op), and only where the move is accepted.
  const canContain =
    row.kind === 'folder' &&
    row.id !== dragged.parentId &&
    (dragged.kind === 'note' ? true : (canMoveFolderInto?.(dragged.id, row.id) ?? false));

  const region = resolveDropRegion(rect, pointer.y, canContain);

  if (region === 'inside') {
    return {
      kind: 'inside',
      folderId: row.id,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  }

  if (region === 'before') {
    return insertTarget(row, 'before');
  }

  const end = subtreeEnd(row);

  // An expanded folder's header has no "after": its position after is the end of its whole rendered
  // subtree (below), so the bottom of the header is nothing rather than a second, competing indicator.
  if (end !== row.element) {
    return null;
  }

  return chooseAfter([row, ...foldersEndingAt(row, end)]);
}
