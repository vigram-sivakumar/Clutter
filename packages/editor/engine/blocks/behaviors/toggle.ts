/**
 * Toggle Block Behavior
 *
 * State mutations and interaction logic for Toggle blocks.
 */

import { useBlockStore } from '../../store/blockStore';

/**
 * Toggle the collapsed state of a toggle block
 */
export function toggleCollapsed(blockId: string): void {
  const block = useBlockStore.getState().getBlock(blockId);
  const currentCollapsed = block?.properties?.collapsed === true;
  useBlockStore.getState().updateProperties(blockId, {
    collapsed: !currentCollapsed,
  });
}
