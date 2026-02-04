/**
 * Checklist Block Behavior
 *
 * State mutations and interaction logic for Checklist blocks.
 */

import { useBlockStore } from '../../store/blockStore';

/**
 * Toggle the checked state of a checklist block
 */
export function toggleChecked(blockId: string): void {
  const block = useBlockStore.getState().getBlock(blockId);
  const currentChecked = block?.properties?.checked === true;
  useBlockStore.getState().updateProperties(blockId, {
    checked: !currentChecked,
  });
}
