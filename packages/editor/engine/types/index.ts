/**
 * Engine Types - Core type definitions for the block engine
 */

export type { Block, BlockType } from './Block';
export { isBlock, createEmptyBlock } from './Block';

export type {
  BlockOperation,
  InsertBlockOperation,
  DeleteBlockOperation,
  MoveBlockOperation,
  SplitBlockOperation,
  MergeBlocksOperation,
  UpdateContentOperation,
  UpdateDescriptionOperation,
  UpdateTypeOperation,
  UpdatePropertiesOperation,
  OperationResult,
} from './BlockOperation';
