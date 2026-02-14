/**
 * ObserverLifecycle.tsx
 * 
 * React hook for managing DOMObserver lifecycle.
 * 
 * CRITICAL INVARIANT:
 * React owns observer lifecycle. Handlers NEVER touch observers.
 * 
 * This hook ensures:
 * - One observer per contenteditable element
 * - Observers are created after DOM renders
 * - Observers are destroyed on unmount
 * - Observer map is kept in sync with node list
 */

import { useEffect, useRef } from 'react';
import { DOMObserver } from '../DOMObserver';
import { scheduleRAF } from '../caret/CaretUtilities';
import type { NodeID } from '../../engine/NodeKernel';

/**
 * Observer map type
 */
export type ObserverMap = Map<NodeID, DOMObserver>;

/**
 * Hook options
 */
export interface UseObserverLifecycleOptions {
  /**
   * List of node IDs that should have observers
   */
  nodeIds: NodeID[];

  /**
   * Optional callback when mutations are batched
   * For diagnostics only - do not use for state updates
   */
  onMutationsBatched?: (nodeId: NodeID, mutations: MutationRecord[]) => void;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Hook return value
 */
export interface UseObserverLifecycleResult {
  /**
   * Map of all active observers
   * Handlers should NEVER access this directly
   */
  observers: React.MutableRefObject<ObserverMap>;
}

/**
 * Manages DOMObserver lifecycle for editor nodes
 * 
 * USAGE:
 * ```typescript
 * const { observers } = useObserverLifecycle({
 *   nodeIds: editorState.nodes.map(n => n.id),
 *   debug: __DEV__,
 * });
 * ```
 * 
 * CONTRACT:
 * - Hook creates/destroys observers based on nodeIds
 * - Handlers NEVER access the observers map
 * - Observer lifecycle is entirely React-managed
 * 
 * @param options - Configuration options
 * @returns Observer map ref (for internal use only)
 */
export function useObserverLifecycle(
  options: UseObserverLifecycleOptions
): UseObserverLifecycleResult {
  const { nodeIds, onMutationsBatched, debug = false } = options;

  // Observer map stored in ref (survives re-renders)
  const observers = useRef<ObserverMap>(new Map());

  // Create/sync observers after render
  useEffect(() => {
    // Wait for DOM to be ready
    const token = scheduleRAF(() => {
      nodeIds.forEach((nodeId) => {
        // Skip if observer already exists
        if (observers.current.has(nodeId)) {
          return;
        }

        // Find the contenteditable element
        const element = document.querySelector(
          `[data-node-id="${nodeId}"]`
        ) as HTMLElement;

        if (!element) {
          if (debug) {

          }
          return;
        }

        // Create observer
        const observer = new DOMObserver({
          element,
          onMutationsBatched: onMutationsBatched
            ? (mutations) => onMutationsBatched(nodeId, mutations)
            : undefined,
        });

        // Store and start
        observers.current.set(nodeId, observer);
        observer.start();

        if (debug) {

        }
      });
    });

    // Cleanup on unmount or when nodeIds change
    return () => {
      token.cancel();

      observers.current.forEach((observer, nodeId) => {
        observer.destroy();
        if (debug) {

        }
      });
      observers.current.clear();
    };
  }, [nodeIds.length, debug]); // Re-run when node count changes

  return { observers };
}
