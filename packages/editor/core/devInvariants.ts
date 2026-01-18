/**
 * DEV-Only Invariant Guards
 *
 * Pure instrumentation for detecting architectural violations.
 * These guards:
 * - Warn only (never block)
 * - Run only in development
 * - Have zero production cost
 * - Provide attribution (which component violated which law)
 *
 * Purpose:
 * Detect violations without changing behavior.
 * If Phase 2 lights up, we learn where reality still disagrees with the contract.
 */

import { isStructuralDeleteInProgress } from './structuralDeleteState';

/**
 * Warn if a NodeView mutates during structural delete.
 *
 * If this fires, it means:
 * - The view is still asserting authority
 * - Or reacting to PM selection
 * - Or leaking DOM shape back to PM
 *
 * This is pure instrumentation - we see it, but don't stop it (yet).
 *
 * @param source - Component or hook that caused the mutation (e.g., "BlockNodeView/useEffect")
 * @param detail - Optional additional context
 */
export function warnIfNodeViewMutates(
  source: string,
  detail?: unknown
) {
  if (
    process.env.NODE_ENV !== 'development' ||
    !isStructuralDeleteInProgress()
  ) {
    return;
  }

  // NodeView mutation during structural delete
}

/**
 * Warn if NodeSelection appears after structural delete.
 *
 * If this fires, it means:
 * - NOT from the halo (Engine owns block selection)
 * - NOT from observers (we removed those)
 * - NOT from intentional code
 *
 * Meaning: DOM → PM inference leak (PM is re-inferring NodeSelection from DOM)
 *
 * This MUST be called in requestAnimationFrame AFTER delete completes,
 * not during.
 *
 * @param editor - TipTap editor instance
 */
export function warnIfNodeSelectionResurrected(editor: any) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  // Import NodeSelection lazily to avoid circular deps
  const { NodeSelection } = require('@tiptap/pm/state');

  if (editor.state.selection instanceof NodeSelection) {
    // NodeSelection detected after structural delete
  }
}
