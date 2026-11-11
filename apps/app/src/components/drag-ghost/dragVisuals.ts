/**
 * The ONE drag-visual system, with no animation. A drag host (the sidebar tree, a Collection View, the property list)
 * decides WHAT is dragged and what a drop does; this decides how a drag LOOKS, in one place, for every layout and
 * every operation:
 *
 *  - ONE ghost in ONE overlay, drawn when the drag begins, placed under the pointer on every move and removed the
 *    moment the drag ends — dropped, cancelled, refused or interrupted. Nothing slides, fades or eases, ever;
 *  - every drag is a SNAPSHOT: one or more clones of the dragged item(s) at measured place and size, relative to
 *    one another exactly as on the page — as if lifted straight out of it; a multi-item drag also states how many
 *    items it carries (`.drag-snapshot__count`). The originals of every dragged item are hidden for the drag
 *    (`data-drag-source` + `visibility: hidden`, see DragGhost.css: kept in the DOM and in layout).
 *
 * Changing how dragging looks is a change to this file and `DRAG_VISUAL_POLICY`, and affects every drag.
 *
 * Lifecycle: `start` ends any drag before it and draws; `dispose` ends this one. Both end in one idempotent `finish`
 * (overlay removed, the hidden original restored, the pointer subscription dropped, every reference released).
 * There are no timers or animation frames to wait for.
 */
import { findScrollContainer, type PointerDragSession } from '@shared/interaction';
import './DragGhost.css';

/** Set to `compact` on a source whose ghost is `DRAG_GHOST_WIDTH_PX` wide instead of the source's own width (a Collection View table or list row, which can span the whole page). */
export const DRAG_GHOST_SIZE_ATTRIBUTE = 'data-drag-ghost-size';

/**
 * Set to `outside-container` on a source whose ghost stays pinned to its column (vertical movement only, the grip
 * kept) while the pointer is over the container it sits in, and follows the pointer freely only once the pointer
 * has left that container horizontally (a sidebar row dragged out to the page).
 */
export const DRAG_GHOST_FOLLOW_ATTRIBUTE = 'data-drag-ghost-follow';

/** The compact ghost width, for a source that opts in with `data-drag-ghost-size="compact"`. */
export const DRAG_GHOST_WIDTH_PX = 256;

/** The attribute that marks an original as hidden for the length of a drag (the rule is in DragGhost.css). */
export const DRAG_SOURCE_ATTRIBUTE = 'data-drag-source';

/** Every tunable of how a drag looks, in one place. */
export const DRAG_VISUAL_POLICY = {
  /** While a drag is on, every source element in the drag is marked hidden (see `DRAG_SOURCE_ATTRIBUTE`). */
  hideOriginals: 'dragged-items',
} as const;

/** What a multi-item snapshot shows of the collection. */
export const SNAPSHOT = {
  /**
   * Only the first this-many rows of the selected items are drawn (rows as the page lays them out: same top), so a
   * list or table selection of up to ten items is drawn in full.
   */
  maxRows: 10,
  /**
   * A ceiling on how many items are cloned, whatever the rows hold (a card grid has several items to a row), so a
   * selection of hundreds costs the same few dozen clones as a selection of thirty. Beyond either bound the ghost is a
   * sample, not the selection: the snapshot's COUNT badge (`.drag-snapshot__count`) always states how many items the
   * drag really carries, so what is drawn is never mistaken for all of it.
   */
  maxItems: 24,
  /** Items whose tops differ by less than this are in one row. */
  rowTolerancePx: 8,
} as const;

/** Attributes that must not be duplicated into a clone: it is a picture of the row, not a second row. */
const STRIPPED_ATTRIBUTES = ['id', 'data-testid', 'tabindex', 'role', 'aria-disabled', 'aria-expanded'];
const STRIPPED_CLASSES = ['entry-interactive', 'entry-force-hover'];

/** A clone made harmless: no ids to duplicate, nothing focusable, no marker another drag could take for a row. */
export function prepareClone(clone: HTMLElement): HTMLElement {
  for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
    STRIPPED_ATTRIBUTES.forEach((attribute) => node.removeAttribute(attribute));
    // Every drag and drop marker (`data-drag-*`, `data-drop-*`): the picture of a row must never be mistaken for a row.
    for (const { name } of Array.from(node.attributes)) {
      if (name.startsWith('data-drag') || name.startsWith('data-drop')) {
        node.removeAttribute(name);
      }
    }
    node.classList.remove(...STRIPPED_CLASSES);
  }
  return clone;
}

export interface DragVisuals {
  /**
   * A drag has begun (the pointer-drag threshold is crossed): draw its ghost and, for a single item, hide the original.
   * `others` are the other items of a multi-item drag (those that are mounted — one that is not is simply not drawn).
   * `count` is how many items the drag carries in all (mounted or not); a multi-item ghost states it. Ends any drag
   * before it.
   */
  start(session: PointerDragSession, others?: readonly HTMLElement[], count?: number): void;
  /** Ends the drag's visuals now: the ghost is gone and the original is back. Safe to call any number of times. */
  dispose(): void;
}

/**
 * A subgrid axis does not resolve to tracks: `getComputedStyle(row).gridTemplateColumns` of a table row is the keyword
 * (`subgrid [] [] []`), never pixel widths — those belong to the ancestor grid the row takes them from.
 */
function isSubgrid(template: string): boolean {
  return /^subgrid(\s|$)/.test(template.trim());
}

/**
 * A clone of a subgrid row, detached from the grid it took its columns from: a subgrid with no parent grid computes
 * to `none`, so the clone's cells would each fall into their own row of ONE column, one on top of the other. Each cell
 * is instead laid at the place and size the page gave its original — measured, not inferred. A child that has no box
 * (`display: contents`) is left alone; a clone that no longer matches its source child for child is left as it is.
 */
function pinChildren(source: HTMLElement, clone: HTMLElement, rect: DOMRect): void {
  const originals = Array.from(source.children);
  const copies = Array.from(clone.children);
  if (originals.length === 0 || originals.length !== copies.length) {
    return;
  }

  clone.style.display = 'block';
  clone.style.position = 'relative';
  originals.forEach((original, index) => {
    const box = original.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) {
      return;
    }
    const cell = copies[index] as HTMLElement;
    cell.style.position = 'absolute';
    cell.style.left = `${box.left - rect.left}px`;
    cell.style.top = `${box.top - rect.top}px`;
    cell.style.width = `${box.width}px`;
    cell.style.height = `${box.height}px`;
    cell.style.margin = '0';
    cell.style.boxSizing = 'border-box';
  });
}

/**
 * A clone of `source` for the snapshot: exactly its measured size, at its measured place, harmless (see
 * `prepareClone`). A grid item gets its columns as the page resolved them — read here, once — since the clone has no
 * parent grid to take them from; a subgrid item (a table row) has no columns of its own to read, so its cells are
 * pinned where they were measured (`pinChildren`). Nothing is inferred about the layout.
 */
function pieceOf(source: HTMLElement, clone: HTMLElement, rect: DOMRect, origin: { x: number; y: number }): HTMLDivElement {
  const piece = document.createElement('div');
  piece.className = 'drag-ghost drag-ghost--piece';
  piece.setAttribute('inert', '');
  piece.setAttribute('aria-hidden', 'true');
  piece.style.left = `${rect.left - origin.x}px`;
  piece.style.top = `${rect.top - origin.y}px`;
  piece.style.width = `${rect.width}px`;
  piece.style.height = `${rect.height}px`;

  const computed = getComputedStyle(source);
  if (computed.display === 'grid' || computed.display === 'inline-grid') {
    if (isSubgrid(computed.gridTemplateColumns)) {
      pinChildren(source, clone, rect);
    } else {
      clone.style.display = 'grid';
      if (computed.gridTemplateColumns && computed.gridTemplateColumns !== 'none') {
        clone.style.gridTemplateColumns = computed.gridTemplateColumns;
      }
    }
  }
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';
  piece.append(clone);
  return piece;
}

/** The sources to draw in a snapshot: the first `SNAPSHOT.maxRows` rows of them (the rows ending at the lead's, if it is further down), at most `SNAPSHOT.maxItems`. */
function firstRows(measured: readonly { source: HTMLElement; rect: DOMRect }[], lead: HTMLElement) {
  const sorted = [...measured].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const rowOf = new Map<HTMLElement, number>();
  let row = -1;
  let rowTop = Number.NEGATIVE_INFINITY;
  for (const entry of sorted) {
    if (entry.rect.top - rowTop > SNAPSHOT.rowTolerancePx) {
      row += 1;
      rowTop = entry.rect.top;
    }
    rowOf.set(entry.source, row);
  }
  const leadRow = rowOf.get(lead) ?? 0;
  // The first rows — or, if the lead sits further down, the rows ending with its own (it is always drawn).
  const first = leadRow >= SNAPSHOT.maxRows ? leadRow - SNAPSHOT.maxRows + 1 : 0;

  const inRows = sorted.filter((entry) => {
    const index = rowOf.get(entry.source)!;
    return index >= first && index < first + SNAPSHOT.maxRows;
  });
  if (inRows.length <= SNAPSHOT.maxItems) {
    return inRows;
  }

  // Too many items for the rows alone: the first of them — and the lead, which is always drawn, in the last place if it fell outside.
  const kept = inRows.slice(0, SNAPSHOT.maxItems);
  if (!kept.some((entry) => entry.source === lead)) {
    kept[kept.length - 1] = inRows.find((entry) => entry.source === lead)!;
  }
  return kept;
}

export function createDragVisuals(): DragVisuals {
  let finishCurrent: (() => void) | null = null;

  function start(session: PointerDragSession, others: readonly HTMLElement[] = [], count?: number): void {
    finishCurrent?.(); // a new drag ends what the last one left

    const lead = session.source;
    const sources = [lead, ...others.filter((element) => element !== lead && element.isConnected)];
    const multi = sources.length > 1;
    const pinsInside = lead.getAttribute(DRAG_GHOST_FOLLOW_ATTRIBUTE) === 'outside-container';
    const container = pinsInside ? findScrollContainer(lead) : null;

    // One overlay, owned here. Inert and aria-hidden: nothing in it takes focus or is announced.
    const overlay = document.createElement('div');
    overlay.className = 'drag-visuals';
    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');

    const ghost = document.createElement('div');
    ghost.className = 'drag-snapshot';
    ghost.setAttribute('inert', '');
    ghost.setAttribute('aria-hidden', 'true');

    // All the reads, once, before anything is written.
    const measured = multi
      ? firstRows(
          sources.map((source) => ({ source, rect: source.getBoundingClientRect() })),
          lead
        )
      : [{ source: lead, rect: lead.getBoundingClientRect() }];
    const origin = {
      x: Math.min(...measured.map((entry) => entry.rect.left)),
      y: Math.min(...measured.map((entry) => entry.rect.top)),
    };
    const snapshotSize = {
      width: Math.max(...measured.map((entry) => entry.rect.right)) - origin.x,
      height: Math.max(...measured.map((entry) => entry.rect.bottom)) - origin.y,
    };
    // Where the press took hold of the snapshot (not where the threshold was crossed).
    const grab = { x: session.press.x - origin.x, y: session.press.y - origin.y };
    for (const { source, rect } of measured) {
      ghost.append(pieceOf(source, prepareClone(source === lead ? session.snapshot : (source.cloneNode(true) as HTMLElement)), rect, origin));
    }
    if (multi) {
      // The rows above are a sample (`SNAPSHOT.maxRows`); the badge is the whole drag's size.
      const badge = document.createElement('div');
      badge.className = 'drag-snapshot__count';
      badge.textContent = String(Math.max(count ?? 0, sources.length));
      ghost.append(badge);
    }
    const initial = lead.getBoundingClientRect();

    const hiddenSources =
      DRAG_VISUAL_POLICY.hideOriginals === 'dragged-items'
        ? sources.filter((source) => source.isConnected).map((source) => ({
            element: source,
            had: source.getAttribute(DRAG_SOURCE_ATTRIBUTE),
          }))
        : [];
    hiddenSources.forEach(({ element }) => element.setAttribute(DRAG_SOURCE_ATTRIBUTE, 'true'));
    overlay.append(ghost);
    document.body.append(overlay);

    let unsubscribe: (() => void) | null = null;
    let finished = false;

    /** Places the snapshot under the pointer; a pinned sidebar row keeps its column while the pointer is inside it. */
    function place() {
      const { pointer, grabOffsetY } = session;
      const rect = lead.isConnected ? lead.getBoundingClientRect() : null;
      const bounds = container?.isConnected ? container.getBoundingClientRect() : null;
      const inside = bounds !== null && pointer.x >= bounds.left && pointer.x <= bounds.right;
      ghost.style.width = `${snapshotSize.width}px`;
      ghost.style.height = `${snapshotSize.height}px`;

      if (
        !multi &&
        (pinsInside ? inside : !session.allowDragOutsideContainer)
      ) {
        ghost.style.left = `${rect?.left ?? initial.left}px`;
        ghost.style.transform = `translate3d(0, ${pointer.y - grabOffsetY}px, 0)`;
      } else {
        // One unit, kept exactly as grabbed.
        ghost.style.left = '0px';
        ghost.style.transform = `translate3d(${pointer.x - grab.x}px, ${pointer.y - grab.y}px, 0)`;
      }
    }

    /** The one way out. Idempotent. */
    function finish() {
      if (finished) {
        return;
      }
      finished = true;
      unsubscribe?.();
      unsubscribe = null;
      window.removeEventListener('resize', place);
      overlay.remove(); // the ghost and every clone with it
      for (const { element, had } of hiddenSources) {
        if (had === null) {
          element.removeAttribute(DRAG_SOURCE_ATTRIBUTE);
        } else {
          element.setAttribute(DRAG_SOURCE_ATTRIBUTE, had);
        }
      }
      if (finishCurrent === finish) {
        finishCurrent = null;
      }
    }

    place();
    unsubscribe = session.subscribe(place);
    window.addEventListener('resize', place);
    finishCurrent = finish;
  }

  return { start, dispose: () => finishCurrent?.() };
}
