/**
 * Block Primitives - Shared building blocks for all block components
 *
 * Usage:
 * ```tsx
 * import { useBlock, BlockHoverZones, BlockContent, BlockSelectionHalo } from './primitives';
 *
 * export function MyBlock({ node, editor, getPos }) {
 *   const { wrapperProps, isSelected, indent } = useBlock({ node, editor, getPos });
 *
 *   return (
 *     <NodeViewWrapper {...wrapperProps}>
 *       <BlockHoverZones />
 *       <BlockContent><NodeViewContent /></BlockContent>
 *       <BlockSelectionHalo isSelected={isSelected} indent={indent} />
 *     </NodeViewWrapper>
 *   );
 * }
 * ```
 */

// Core hook
export { useBlock } from './useBlock';
export type { UseBlockOptions, UseBlockReturn } from './useBlock';

// Components
export { BlockHoverZones } from './BlockHoverZones';
export { BlockContent } from './BlockContent';
export { BlockContentColumn } from './BlockContentColumn';
export { MarkerContainer } from './MarkerContainer';
export { BlockSelectionHalo } from './BlockSelectionHalo';

// Style utilities
export {
  getBlockContainerStyle,
  getMarkerStyle,
  getContentStyle,
  blockStyleObjects,
} from './blockStyles';
