/**
 * Block Engine - Custom block-first editor foundation
 *
 * This is the POC/foundation for the new block-first architecture.
 *
 * Architecture:
 * - Tree structure with explicit parent/children relationships
 * - ID-based (not position-based)
 * - Pure operation functions (testable, replayable)
 * - Zustand + Immer for state management
 * - Graph features layered on top (links, embeds - later)
 *
 * This runs alongside the existing ProseMirror editor (no conflicts).
 * Once validated, we'll migrate to Lexical integration and full replacement.
 *
 * @see README for architecture details
 * @see __tests__ for usage examples
 * @see demo/BlockEngineDemo.tsx for visual testing
 */

// Types
export type { Block, BlockType } from './types';
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
} from './types';
export { isBlock, createEmptyBlock } from './types';

// Store
export { useBlockStore } from './store';

// Operations (for advanced usage/testing)
export {
  insertBlock,
  deleteBlock,
  moveBlock,
  splitBlock,
  mergeBlocks,
  updateContent,
  updateDescription,
  updateType,
  updateProperties,
} from './operations';
export type { SplitResult, MergeResult } from './operations';

// Utilities
export {
  validateTree,
  getRootBlocks,
  getDescendantIds,
  getBlockPath,
  getNextSiblingId,
  getPreviousSiblingId,
} from './utils';

// Lexical integration
export { LexicalBlockEditor } from './lexical';
export type { LexicalBlockEditorProps } from './lexical';
export { createBlockEditorConfig } from './lexical';

// Document editor (Step 7B)
export { LexicalDocumentEditor } from './components/LexicalDocumentEditor';

// Focus management
export { useFocusManager } from './focus';
export type { FocusManager } from './focus';

// Slash commands
export { SlashCommandPlugin, CommandMenu } from './commands';
export { createCommandRegistry, defaultCommandRegistry } from './commands';
export type {
  SlashCommand,
  CommandCategory,
  CommandContext,
  CommandRegistry,
} from './commands';

// Migration tools
export * from './migration';
export {
  testMigration,
  testBlockMigration,
  createSamplePMDocument,
} from './migration/testUtils';

// Serialization (native blocks format)
export * from './serialization';

// Demo component (for testing)
export { BlockEngineDemo } from './demo/BlockEngineDemo';
