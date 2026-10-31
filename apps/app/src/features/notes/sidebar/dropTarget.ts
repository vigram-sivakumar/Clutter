/**
 * Where a dragged sidebar row would land if it were dropped now — calculation only. Nothing here moves,
 * reorders or persists anything; it turns the pointer position plus the rendered rows into one of three
 * states: no target, "into this folder", or "insert at this boundary of a sibling list".
 *
 * Rows are read from the DOM (`data-drag-*` attributes, present only on rows the Notes tree rendered with
 * drag enabled), which is what keeps the interaction exclusive to the Notes section: a row anywhere else
 * carries no attributes and so can never be a target.
 */

import { findScrollContainer } from '@shared/interaction';

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

/**
 * The special drop destinations outside the tree's own rows — reserved folders the sidebar shows as
 * entries — and what each accepts. This is the one place that rule lives: hover feedback reads it, and
 * the drop re-reads it, so a highlight alone can never allow a move. An asset is accepted nowhere else.
 */
export type DropZone = 'templates' | 'inbox' | 'assets';

export const DROP_ZONE_ACCEPTS: Readonly<Record<DropZone, readonly DragItem['kind'][]>> = {
  templates: ['note', 'folder'],
  inbox: ['note'],
  assets: ['asset'],
};

export const isDropZone = (value: string | undefined): value is DropZone =>
  value === 'templates' || value === 'inbox' || value === 'assets';

export interface DragItem {
  readonly kind: 'folder' | 'note' | 'asset';
  readonly id: string;
  /** `null` = the vault root. */
  readonly parentId: string | null;
  /**
   * Set when the drag carries several items (a Collection View's checked selection): all of them, in the
   * selection's order, THIS item first — it is the one the pointer took hold of. Absent for a single-item drag,
   * which is every drag from the sidebar.
   */
  readonly items?: readonly DragItem[];
}

/** Everything a drag carries: its `items`, or just the item itself. */
export function draggedItems(item: DragItem): readonly DragItem[] {
  return item.items ?? [item];
}

/**
 * The move-rule checks of ONE item, widened to everything the drag carries — so a destination is offered only
 * where the whole drop can happen, and the rules themselves stay where they live (`FolderOperations.canMove`,
 * `PageOperations.canMove`), asked once per item and never restated:
 *  - every folder must be accepted (itself, a descendant — of the destination or of another dragged folder
 *    — an archived or reserved place, a name already taken there);
 *  - notes are moved one by one, so a note the destination refuses is only skipped: the destination stays valid
 *    while at least one item of the drag can move.
 * For a single item this is exactly the item's own check.
 */
export function wholeDragOracles(
  items: readonly DragItem[],
  oracles: {
    readonly canMoveFolderInto?: (folderId: string, destinationFolderId: string | null) => boolean | undefined;
    readonly canMoveNoteInto?: (pageId: string, destinationFolderId: string | null) => boolean | undefined;
  }
): {
  canMoveFolderInto: (folderId: string, destinationFolderId: string | null) => boolean;
  canMoveNoteInto: (pageId: string, destinationFolderId: string | null) => boolean;
} {
  const folderOk = (item: DragItem, destination: string | null) => oracles.canMoveFolderInto?.(item.id, destination) ?? false;
  const noteOk = (item: DragItem, destination: string | null) => oracles.canMoveNoteInto?.(item.id, destination) ?? true;

  const allowed = (destination: string | null): boolean => {
    const folders = items.filter((item) => item.kind === 'folder');
    const notes = items.filter((item) => item.kind === 'note');

    return folders.every((item) => folderOk(item, destination)) && (folders.length > 0 || notes.some((item) => noteOk(item, destination)));
  };

  return { canMoveFolderInto: (_id, destination) => allowed(destination), canMoveNoteInto: (_id, destination) => allowed(destination) };
}

/** A rendered, drag-aware row. */
export interface DragRow extends Omit<DragItem, 'kind'> {
  /** Only folders and notes are layout rows; an asset is dragged but never positioned among them. */
  readonly kind: 'folder' | 'note';
  readonly element: HTMLElement;
  readonly level: number;
  /** Siblings after this one exist but are hidden behind the list's "N more" row. */
  readonly tailHidden: boolean;
  /**
   * A Collection View card or row: a folder here is only ever a destination to move INTO (the whole
   * card), never a place in a sibling list — there is no manual order there. See `data-drag-inside-only`.
   */
  readonly insideOnly: boolean;
  /**
   * A Collection View note row of a folder that is in Manual order (`data-drag-reorder`): it still is not part of
   * a sibling list like the tree's rows, but its edges are positions in its own folder's order for a drag that
   * comes from that same folder — the only reordering a Collection View offers.
   */
  readonly reorder?: boolean;
}

export type DropTarget =
  | {
      readonly kind: 'inside';
      readonly folderId: string;
      /** Set when the folder is one of the special destinations (see DropZone), not a tree row. */
      readonly zone?: DropZone;
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
      a.zone === b.zone &&
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
  // Asset rows are draggable but are never part of a sibling list, so they are not layout rows.
  return Array.from(root.querySelectorAll<HTMLElement>('[data-drag-id]:not([data-drag-kind="asset"])')).map((element) => ({
    element,
    kind: element.dataset.dragKind === 'folder' ? 'folder' : 'note',
    id: element.dataset.dragId!,
    parentId: element.dataset.dragParent ? element.dataset.dragParent : null,
    level: levelOf(element),
    tailHidden: element.dataset.dragTailHidden === 'true',
    insideOnly: element.dataset.dragInsideOnly === 'true',
    reorder: element.dataset.dragReorder === 'true',
  }));
}

/**
 * A folder that lives outside the tree's own rows but can still be dropped onto — today the sidebar's
 * Templates entry (a reserved folder the tree never lists). It resolves to the same "inside this
 * folder" target a folder row does, so the highlight and the move are the ones a folder drop already
 * has; it is never part of a manual sibling order.
 */
export interface DropDestination {
  readonly element: HTMLElement;
  readonly folderId: string;
  readonly zone: DropZone;
}

/** Every rendered drop destination marked with `data-drop-folder-id` and a known `data-drop-zone`, in document order. */
export function collectDropDestinations(root: ParentNode = document): DropDestination[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-drop-folder-id]'))
    .filter((element) => isDropZone(element.dataset.dropZone))
    .map((element) => ({
      element,
      folderId: element.dataset.dropFolderId!,
      zone: element.dataset.dropZone as DropZone,
    }));
}

export interface ResolveDropTargetInput {
  readonly pointer: { readonly x: number; readonly y: number };
  /** Folders outside the tree that accept drops (see DropDestination). Absent: none. */
  readonly destinations?: readonly DropDestination[];
  readonly dragged: DragItem;
  readonly rows: readonly DragRow[];
  /**
   * The folder-move rules, asked rather than restated (FolderOperations.canMove). Without it, a dragged
   * folder gets no destination at all: the rules are never guessed.
   */
  readonly canMoveFolderInto?: (folderId: string, destinationFolderId: string | null) => boolean;
  /** The note-move rules (PageOperations.canMove), asked the same way. Absent: a note is offered every folder. */
  readonly canMoveNoteInto?: (pageId: string, destinationFolderId: string | null) => boolean;
  /**
   * Whether `parentId`'s children may be put in a new order by a drag of SEVERAL items — only a level in Manual
   * order. Absent: no. A single item keeps the sidebar's own rule (a position is offered in a level sorted any way).
   */
  readonly canReorderLevel?: (parentId: string | null) => boolean;
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

export function resolveDropTarget({ pointer, dragged, rows: allRows, destinations, canMoveFolderInto, canMoveNoteInto, canReorderLevel }: ResolveDropTargetInput): DropTarget | null {
  // Sibling-list logic (neighbours, subtrees) only ever concerns the tree's own rows.
  const rows = allRows.filter((row) => !row.insideOnly);
  const draggedKey = rowKey(dragged);
  const draggedKeys = new Set(draggedItems(dragged).map(rowKey));
  const contains = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y < rect.bottom;
  };

  // Over a folder outside the tree (Templates): the whole row means "into it" — there is no before/after,
  // since it is not in any sibling list. Offered only where the move would be accepted, like a folder row.
  const destination = destinations?.find((candidate) => contains(candidate.element));
  if (destination) {
    const accepted =
      draggedItems(dragged).every((item) => DROP_ZONE_ACCEPTS[destination.zone].includes(item.kind)) &&
      destination.folderId !== dragged.parentId &&
      (dragged.kind === 'folder'
        ? (canMoveFolderInto?.(dragged.id, destination.folderId) ?? false)
        : dragged.kind !== 'note' || (canMoveNoteInto?.(dragged.id, destination.folderId) ?? true));
    if (!accepted) {
      return null;
    }
    const rect = destination.element.getBoundingClientRect();
    return {
      kind: 'inside',
      folderId: destination.folderId,
      zone: destination.zone,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };
  }

  // An asset belongs only on its own destination (above): never into a folder row or a sibling list.
  if (dragged.kind === 'asset') {
    return null;
  }

  // May the dragged item end up as a child of `destination` (a folder id, or null for the root)?
  const canJoin = (destination: string | null): boolean => {
    // A note always belongs to a folder: the vault root is never a destination for one, so no position
    // in the root list is ever offered to a note — even a note that happens to sit there today.
    if (dragged.kind === 'note' && destination === null) {
      return false;
    }
    // Several items are only ever REordered, in place, and only in a Manual level — never moved and placed in one go.
    if (dragged.items) {
      return destination === dragged.parentId && (canReorderLevel?.(destination) ?? false);
    }
    if (destination === dragged.parentId) {
      return true; // reordering where it already is
    }
    return dragged.kind === 'note' ? (canMoveNoteInto?.(dragged.id, destination) ?? true) : (canMoveFolderInto?.(dragged.id, destination) ?? false);
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
    if (draggedKeys.has(rowKey(candidate)) || !canJoin(candidate.parentId)) {
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

  const row = allRows.find((candidate) => contains(candidate.element));

  // A Collection View note row in a Manual folder: its halves are the positions before and after it in that
  // folder's order — for a drag from the same folder only (so a note row is still no destination for anything else).
  if (row && row.insideOnly && row.reorder && row.kind === 'note') {
    if (draggedKeys.has(rowKey(row)) || row.parentId !== dragged.parentId || !canJoin(row.parentId)) {
      return null;
    }
    const rect = row.element.getBoundingClientRect();
    const edge = resolveDropRegion(rect, pointer.y, false) === 'before' ? 'before' : 'after';
    return {
      kind: 'insert',
      parentId: row.parentId,
      edge,
      rowId: row.id,
      rowKind: 'note',
      line: { y: edge === 'before' ? rect.top : rect.bottom, left: rect.left, width: rect.width },
    };
  }

  // A Collection View card: moving INTO a folder is the only thing it offers, to a drag from ANY surface —
  // there is no manual order there. (What a drop target offers belongs to the target, never to the drag's origin.)
  if (row && row.insideOnly) {
    const accepted =
      rowKey(row) !== draggedKey &&
      row.kind === 'folder' &&
      row.id !== dragged.parentId &&
      (dragged.kind === 'note' ? (canMoveNoteInto?.(dragged.id, row.id) ?? true) : (canMoveFolderInto?.(dragged.id, row.id) ?? false));
    if (!accepted) {
      return null;
    }
    const rect = row.element.getBoundingClientRect();
    return { kind: 'inside', folderId: row.id, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } };
  }
  // The empty space below the tree's last row (inside the sidebar's scrolling area) is the END of the top-level
  // list: "after" the outermost folder the last row sits in — the same candidate, validation and indicator as
  // hovering that row's bottom edge, never "into" anything, and never a level picked from the pointer's x.
  if (!row) {
    const last = rows[rows.length - 1];
    const container = last ? findScrollContainer(last.element) : null;
    if (last && container) {
      let lastEntry = last.element;
      for (let next = lastEntry.nextElementSibling; next && next.classList.contains('entry'); next = next.nextElementSibling) {
        lastEntry = next as HTMLElement;
      }
      const area = container.getBoundingClientRect();
      const belowTree = pointer.y >= lastEntry.getBoundingClientRect().bottom && pointer.y <= area.bottom;
      if (belowTree && pointer.x >= area.left && pointer.x <= area.right) {
        // (`lastEntry`, not the last row's own subtree end: a folder's "N more" row is part of that folder's subtree.)
        const enclosing = foldersEndingAt(last, lastEntry);
        return insertTarget(enclosing[enclosing.length - 1] ?? last, 'after');
      }
    }
  }

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
    (dragged.kind === 'note' ? (canMoveNoteInto?.(dragged.id, row.id) ?? true) : (canMoveFolderInto?.(dragged.id, row.id) ?? false));

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
