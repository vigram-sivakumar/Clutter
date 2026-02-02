/**
 * BlockStore - Zustand store for block state management
 *
 * This wraps the pure operation functions with Zustand + Immer.
 *
 * Architecture:
 * - State: Map of blocks + root IDs
 * - Actions: Call pure operations, update state immutably
 * - Queries: Derived data (getBlock, getChildren, etc.)
 * - Validation: Optional tree integrity checks in dev mode
 *
 * Why Zustand + Immer:
 * - Simple API (no boilerplate)
 * - Immer = safe mutations (looks mutable, returns immutable)
 * - DevTools support
 * - Fast (scales to 10k+ blocks)
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { enableMapSet } from 'immer';
import { nanoid } from 'nanoid';

import type { Block, BlockType } from '../types';
import * as operations from '../operations';
import { validateTree, getRootBlocks, getBlockPath } from '../utils';

// Enable Immer support for Map/Set
enableMapSet();

/**
 * Block Store State
 */
interface BlockStore {
  // === STATE ===

  /** All blocks (ID → Block) */
  blocks: Map<string, Block>;

  /** Root block IDs (ordered) */
  rootIds: string[];

  // === OPERATIONS ===

  /**
   * Insert a new block after target (or at start if null)
   */
  insertBlock: (afterId: string | null, type: BlockType) => string;

  /**
   * Delete a block (and optionally descendants)
   */
  deleteBlock: (id: string, deleteDescendants?: boolean) => void;

  /**
   * Move a block to new parent/position
   */
  moveBlock: (id: string, newParent: string | null, index: number) => void;

  /**
   * Split a block at cursor offset (Enter key)
   * Returns ID of new block
   */
  splitBlock: (id: string, offset: number) => string;

  /**
   * Merge source block with target (Backspace key)
   * Returns cursor offset in target block
   */
  mergeBlocks: (sourceId: string, targetId: string) => number;

  /**
   * Update block content
   */
  updateContent: (id: string, content: string) => void;

  /**
   * Update block description
   */
  updateDescription: (id: string, description: string | undefined) => void;

  /**
   * Update block type
   */
  updateType: (id: string, type: BlockType) => void;

  /**
   * Update block properties
   */
  updateProperties: (id: string, properties: Record<string, any>) => void;

  // === QUERIES ===

  /**
   * Get a block by ID
   */
  getBlock: (id: string) => Block | undefined;

  /**
   * Get children of a block (or roots if null)
   */
  getChildren: (parentId: string | null) => Block[];

  /**
   * Get path from root to block (breadcrumbs)
   */
  getPath: (id: string) => Block[];

  /**
   * Get all blocks as array
   */
  getAllBlocks: () => Block[];

  /**
   * Get root blocks (blocks with no parent)
   */
  getRootBlocks: () => Block[];

  // === UTILITIES ===

  /**
   * Validate tree integrity (dev only)
   */
  validate: () => void;

  /**
   * Clear all blocks (reset store)
   */
  clear: () => void;

  /**
   * Load blocks from array (e.g., migration result)
   * Replaces all blocks in store
   */
  loadBlocks: (blocks: Block[]) => void;
}

/**
 * Create the block store
 */
export const useBlockStore = create<BlockStore>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      blocks: new Map(),
      rootIds: [],

      // === OPERATIONS ===

      insertBlock: (afterId, type) => {
        const newBlockId = nanoid();
        const newBlock: Block = {
          id: newBlockId,
          type,
          parent: null,
          children: [],
          content: '',
          properties: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => {
          state.blocks = operations.insertBlock(
            state.blocks,
            afterId,
            newBlock
          );

          // Update root IDs
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });

        return newBlockId;
      },

      deleteBlock: (id, deleteDescendants = true) => {
        set((state) => {
          state.blocks = operations.deleteBlock(
            state.blocks,
            id,
            deleteDescendants
          );

          // Update root IDs
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });
      },

      moveBlock: (id, newParent, index) => {
        set((state) => {
          state.blocks = operations.moveBlock(
            state.blocks,
            id,
            newParent,
            index
          );

          // Update root IDs
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });
      },

      splitBlock: (id, offset) => {
        let newBlockId = '';

        set((state) => {
          const result = operations.splitBlock(state.blocks, id, offset);
          state.blocks = result.blocks;
          newBlockId = result.newBlockId;

          // Update root IDs
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });

        return newBlockId;
      },

      mergeBlocks: (sourceId, targetId) => {
        let cursorOffset = 0;

        set((state) => {
          const result = operations.mergeBlocks(
            state.blocks,
            sourceId,
            targetId
          );
          state.blocks = result.blocks;
          cursorOffset = result.cursorOffset;

          // Update root IDs
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });

        return cursorOffset;
      },

      updateContent: (id, content) => {
        set((state) => {
          state.blocks = operations.updateContent(state.blocks, id, content);
        });
      },

      updateDescription: (id, description) => {
        set((state) => {
          state.blocks = operations.updateDescription(
            state.blocks,
            id,
            description
          );
        });
      },

      updateType: (id, type) => {
        set((state) => {
          state.blocks = operations.updateType(state.blocks, id, type);
        });
      },

      updateProperties: (id, properties) => {
        set((state) => {
          state.blocks = operations.updateProperties(
            state.blocks,
            id,
            properties
          );
        });
      },

      // === QUERIES ===

      getBlock: (id) => {
        return get().blocks.get(id);
      },

      getChildren: (parentId) => {
        const { blocks } = get();

        if (parentId === null) {
          // Return root blocks
          return getRootBlocks(blocks);
        }

        const parent = blocks.get(parentId);
        if (!parent) return [];

        return parent.children
          .map((childId) => blocks.get(childId))
          .filter((block): block is Block => block !== undefined);
      },

      getPath: (id) => {
        return getBlockPath(get().blocks, id);
      },

      getAllBlocks: () => {
        return Array.from(get().blocks.values());
      },

      getRootBlocks: () => {
        return getRootBlocks(get().blocks);
      },

      // === UTILITIES ===

      validate: () => {
        validateTree(get().blocks);
      },

      clear: () => {
        set((state) => {
          state.blocks = new Map();
          state.rootIds = [];
        });
      },

      loadBlocks: (blocks) => {
        set((state) => {
          state.blocks = new Map(blocks.map((b) => [b.id, b]));
          state.rootIds = getRootBlocks(state.blocks).map((b) => b.id);

          if (process.env.NODE_ENV === 'development') {
            validateTree(state.blocks);
          }
        });
      },
    })),
    { name: 'BlockStore' }
  )
);
