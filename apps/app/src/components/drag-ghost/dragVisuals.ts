/**
 * The ONE drag-visual system, with no animation. A drag host (the sidebar tree, a Collection View, the property list)
 * decides WHAT is dragged and what a drop does; this decides how a drag LOOKS, in one place, for every layout and
 * every operation:
 *
 *  - ONE ghost in ONE overlay, drawn when the drag begins, placed under the pointer on every move and removed the
 *    moment the drag ends — dropped, cancelled, refused or interrupted. Nothing slides, fades or eases, ever;
 *  - a single item is a clone of that item (a picture of the row, not a second row), and its original is hidden for
 *    the drag (`data-drag-source` + `visibility: hidden`, see DragGhost.css: kept in the DOM and in layout, border and
 *    pseudo-elements and all);
 *  - several items are a SNAPSHOT of the collection as it is: a clone of each selected item at its own measured
 *    place and size, relative to one another exactly as on the page — cards in their columns and gaps, list rows,
 *    table rows with their columns — as if lifted straight out of it, the first few rows of it. No layout is
 *    computed here: only measured positions are copied, so every layout is mirrored by the same code. The
 *    originals all stay as they are — visible, selected — throughout.
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
  /** Whose originals are hidden while their clone is dragged: a single item's only; several items' all stay visible. */
  hideOriginals: 'single-item-drags',
} as const;

/** What a multi-item snapshot shows of the collection. */
export const SNAPSHOT = {
  /** Only the first this-many rows of the selected items are drawn (rows as the page lays them out: same top). */
  maxRows: 3,
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
   * Ends any drag before it.
   */
  start(session: PointerDragSession, others?: readonly HTMLElement[]): void;
  /** Ends the drag's visuals now: the ghost is gone and the original is back. Safe to call any number of times. */
  dispose(): void;
}

/**
 * A clone of `source` for the snapshot: exactly its measured size, at its measured place, harmless (see
 * `prepareClone`). A grid or subgrid item (a table row) gets its columns as the page resolved them — read here,
 * once — since the clone has no parent grid to take them from. Nothing is inferred about the layout.
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
    clone.style.display = 'grid';
    if (computed.gridTemplateColumns && computed.gridTemplateColumns !== 'none') {
      clone.style.gridTemplateColumns = computed.gridTemplateColumns;
    }
  }
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';
  piece.append(clone);
  return piece;
}

/** The sources to draw in a snapshot: the first `SNAPSHOT.maxRows` rows of them (the rows ending at the lead's, if it is further down). */
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

  return sorted.filter((entry) => {
    const index = rowOf.get(entry.source)!;
    return index >= first && index < first + SNAPSHOT.maxRows;
  });
}

export function createDragVisuals(): DragVisuals {
  let finishCurrent: (() => void) | null = null;

  function start(session: PointerDragSession, others: readonly HTMLElement[] = []): void {
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
    ghost.className = multi ? 'drag-snapshot' : 'drag-ghost';
    ghost.setAttribute('inert', '');
    ghost.setAttribute('aria-hidden', 'true');

    // All the reads, once, before anything is written.
    let snapshotSize = { width: 0, height: 0 };
    let grab = { x: 0, y: 0 };
    if (multi) {
      const measured = firstRows(
        sources.map((source) => ({ source, rect: source.getBoundingClientRect() })),
        lead
      );
      const origin = {
        x: Math.min(...measured.map((entry) => entry.rect.left)),
        y: Math.min(...measured.map((entry) => entry.rect.top)),
      };
      snapshotSize = {
        width: Math.max(...measured.map((entry) => entry.rect.right)) - origin.x,
        height: Math.max(...measured.map((entry) => entry.rect.bottom)) - origin.y,
      };
      // Where the pointer took hold of the snapshot, so it is lifted out in place — under the pointer as it was.
      grab = { x: session.pointer.x - origin.x, y: session.pointer.y - origin.y };
      for (const { source, rect } of measured) {
        ghost.append(pieceOf(source, prepareClone(source === lead ? session.snapshot : (source.cloneNode(true) as HTMLElement)), rect, origin));
      }
    } else {
      ghost.append(prepareClone(session.snapshot));
    }
    const initial = lead.getBoundingClientRect();

    // Then the writes, together: hide a single item's original and show the ghost.
    const hidden = DRAG_VISUAL_POLICY.hideOriginals === 'single-item-drags' && !multi ? lead : null;
    const hadAttribute = hidden?.getAttribute(DRAG_SOURCE_ATTRIBUTE) ?? null;
    hidden?.setAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    overlay.append(ghost);
    document.body.append(overlay);

    let unsubscribe: (() => void) | null = null;
    let finished = false;

    /** Places the ghost under the pointer: centred on it, or — a pinned sidebar row — kept in its column. */
    function place() {
      const { pointer, grabOffsetY, allowDragOutsideContainer } = session;
      const rect = lead.isConnected ? lead.getBoundingClientRect() : null;
      const bounds = container?.isConnected ? container.getBoundingClientRect() : null;
      const inside = bounds !== null && pointer.x >= bounds.left && pointer.x <= bounds.right;
      const free = allowDragOutsideContainer && !(pinsInside && inside);
      const compact = allowDragOutsideContainer && lead.getAttribute(DRAG_GHOST_SIZE_ATTRIBUTE) === 'compact';
      const width = multi ? snapshotSize.width : compact ? DRAG_GHOST_WIDTH_PX : (rect?.width ?? initial.width);
      const height = multi ? snapshotSize.height : (rect?.height ?? initial.height);
      ghost.style.width = `${width}px`;
      ghost.style.height = `${height}px`;

      if (multi) {
        // One unit, kept exactly as grabbed.
        ghost.style.left = '0px';
        ghost.style.transform = `translate3d(${pointer.x - grab.x}px, ${pointer.y - grab.y}px, 0)`;
      } else if (free) {
        // Centred on the cursor, from the ghost's own size — no source-relative offset anywhere.
        ghost.style.left = '0px';
        ghost.style.transform = `translate3d(${pointer.x - width / 2}px, ${pointer.y - height / 2}px, 0)`;
      } else {
        ghost.style.left = `${rect?.left ?? initial.left}px`;
        ghost.style.transform = `translate3d(0, ${pointer.y - grabOffsetY}px, 0)`;
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
      if (hidden) {
        // Back to exactly what the original had: the marker is only ever the hiding, never a style of its own.
        if (hadAttribute === null) {
          hidden.removeAttribute(DRAG_SOURCE_ATTRIBUTE);
        } else {
          hidden.setAttribute(DRAG_SOURCE_ATTRIBUTE, hadAttribute);
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
