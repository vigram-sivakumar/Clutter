import { useSyncExternalStore } from 'react';
import { DropFeedback } from '@components/drag-ghost/DropFeedback';
import { sameDropTarget, type DropTarget } from './dropTarget';

/**
 * The drop target a drag currently shows, as a tiny external store read by <DropFeedbackHost>. It is not
 * component state: while a list auto-scrolls the target changes every frame, and that must re-render the
 * indicator alone, never the tree or page that owns the drag. Shared by every surface that drags a note or folder.
 */
export interface DropTargetStore {
  get(): DropTarget | null;
  set(next: DropTarget | null): void;
  subscribe(listener: () => void): () => void;
}

export function createDropTargetStore(): DropTargetStore {
  let current: DropTarget | null = null;
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set(next) {
      if (!sameDropTarget(current, next)) {
        current = next;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Draws the one drop indicator for the store's target; re-renders alone when it changes. */
export function DropFeedbackHost({ store }: { store: DropTargetStore }) {
  const target = useSyncExternalStore(store.subscribe, store.get);
  return target ? <DropFeedback shape={target} /> : null;
}
