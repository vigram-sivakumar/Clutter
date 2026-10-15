import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { collectionViewKeyForSidebarLevel } from '@core/application/collection/collectionViewKey';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { sidebarOrderId, type SidebarSort } from '@core/properties/sidebarSort';
import { displayedOrderIds, placeInOrder } from './sidebarSort';

/**
 * Everything that writes a sidebar level's order, in one place — so a drop has the same effect whichever
 * surface it began on (the sidebar tree or a Collection View). Each function is given the store (or the
 * level's reads and write) it works on; none knows where the dragged item came from.
 */

/** A level's saved sort and order, and the one way to write a new order. */
export interface LevelOrderContext {
  readonly membershipSelector: MembershipSelector;
  getSort(parentId: string | null): SidebarSort | undefined;
  getOrder(parentId: string | null): readonly string[] | undefined;
  /** Writes the level's Manual mode and this order in ONE update. */
  setOrder(parentId: string | null, order: readonly string[]): void;
}

/** The context over the real store. */
export function levelOrderContextFor(store: CollectionViewConfigStore, membershipSelector: MembershipSelector): LevelOrderContext {
  return {
    membershipSelector,
    getSort: (parentId) => store.get(collectionViewKeyForSidebarLevel(parentId))?.sidebarSort,
    getOrder: (parentId) => store.get(collectionViewKeyForSidebarLevel(parentId))?.sidebarOrder,
    setOrder: (parentId, order) =>
      store.update(collectionViewKeyForSidebarLevel(parentId), {
        sidebarSort: { key: 'manual', direction: 'down' },
        sidebarOrder: order,
      }),
  };
}

/**
 * A positional drop: puts `item` before/after `anchor` among `parentId`'s children and makes that level
 * Manual. The new order starts from what the level draws right now — its sort applied, or its saved manual
 * order — with the item placed, and is written together with the mode, so the level never flickers back to its
 * old order. Positions are offered in a level sorted any way; merely dragging writes nothing.
 */
export function placeSiblingInLevel(
  context: LevelOrderContext,
  item: { readonly kind: 'folder' | 'note' | 'asset'; readonly id: string },
  parentId: string | null,
  anchor: { readonly kind: 'folder' | 'note'; readonly id: string },
  edge: 'before' | 'after'
): void {
  // An asset is never placed among the manual order (a drop only ever moves it).
  if (item.kind === 'asset') {
    return;
  }

  const drawn = displayedOrderIds(context.membershipSelector, parentId, context.getSort(parentId), context.getOrder(parentId));
  context.setOrder(parentId, placeInOrder(drawn, sidebarOrderId(item.kind, item.id), sidebarOrderId(anchor.kind, anchor.id), edge));
}

/**
 * A successful move out of `parentId`: forget the item in that level's saved order, so coming back later puts
 * it at the end rather than at its old position. The level's sort is left as it is.
 */
export function forgetInLevelOrder(
  store: CollectionViewConfigStore,
  parentId: string | null,
  kind: 'folder' | 'note',
  id: string
): void {
  const key = collectionViewKeyForSidebarLevel(parentId);
  const order = store.get(key)?.sidebarOrder;
  const remaining = order?.filter((entry) => entry !== sidebarOrderId(kind, id));

  if (order && remaining && remaining.length !== order.length) {
    store.update(key, { sidebarOrder: remaining.length > 0 ? remaining : undefined });
  }
}
