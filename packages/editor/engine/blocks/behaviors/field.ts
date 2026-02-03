/**
 * Field Block Behavior
 *
 * Handles state mutations and interaction logic for Field blocks.
 * Chrome calls these functions but never mutates state directly.
 *
 * Architecture:
 * - All functions are pure or only access the block store
 * - No DOM manipulation
 * - No rendering logic
 */

import { useBlockStore } from '../../store/blockStore';

/**
 * Update the label text of a Field block
 */
export function updateLabel(blockId: string, label: string): void {
  useBlockStore.getState().updateProperties(blockId, { label });
}

/**
 * Update the icon of a Field block
 */
export function updateIcon(blockId: string, icon: string): void {
  useBlockStore.getState().updateProperties(blockId, { icon });
}

/**
 * Handle keyboard events in the label editor
 *
 * Rules (Phase 1 - local handling):
 * - Enter / Shift+Enter → Blur label, focus value (via callback)
 * - Escape → Blur label, keep changes
 * - Tab → Blur label, default navigation (don't preventDefault)
 *
 * Phase 2 (future): This will be unified in BlockInteractionPlugin
 */
export function handleLabelKeyDown(
  e: React.KeyboardEvent<HTMLSpanElement>,
  blockId: string,
  onFocusValue?: () => void
): void {
  // Enter or Shift+Enter → commit and focus value
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.blur();

    // TODO: Implement focus transfer in v1.1
    // For now, just blur (user manually clicks value)
    if (onFocusValue) {
      onFocusValue();
    }
  }

  // Escape → blur without revert (keep current text)
  if (e.key === 'Escape') {
    e.preventDefault();
    e.currentTarget.blur();
  }

  // Tab → let default behavior handle navigation
  // (blur happens automatically, focus moves to next block)
  if (e.key === 'Tab') {
    e.currentTarget.blur();
    // Don't preventDefault - let Tab navigate naturally
  }
}
