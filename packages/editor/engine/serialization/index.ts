/**
 * Serialization Module
 *
 * Native blocks storage format for greenfield editor.
 */

export type { BlocksDocument, LegacyPMDocument, StoredDocument } from './types';
export { isBlocksDocument, isLegacyPMDocument } from './types';

export {
  serializeBlocks,
  deserializeBlocks,
  serializeBlocksToJSON,
  deserializeBlocksFromJSON,
} from './serialize';
