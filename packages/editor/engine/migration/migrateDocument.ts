/**
 * Document Migration
 *
 * Convert entire ProseMirror documents to the new block engine format.
 */

import { nanoid } from 'nanoid';
import type { Block, BlockType } from '../types/Block';
import type {
  PMDocument,
  PMNode,
  PMBlockAttrs,
  DocumentMigrationResult,
  MigrationOptions,
  MigrationResult,
} from './types';
import { convertBlockContent, extractPlainText } from './converters';
import { validateTree } from '../utils/treeValidation';

/**
 * Map PM node type to Block type
 */
function pmTypeToBlockType(pmType: string, attrs?: PMBlockAttrs): BlockType {
  switch (pmType) {
    case 'paragraph':
      return 'paragraph';
    case 'heading':
      return 'heading';
    case 'listBlock':
      // Map list types
      if (attrs?.listType === 'bullet') return 'bulletList';
      if (attrs?.listType === 'numbered') return 'numberedList';
      if (attrs?.listType === 'task') return 'todoList';
      return 'bulletList';
    case 'blockquote':
      return 'quote';
    case 'codeBlock':
      return 'code';
    case 'callout':
      return 'callout';
    default:
      // Unknown types become paragraphs
      return 'paragraph';
  }
}

/**
 * Convert single PM node to Block
 */
function convertPMNodeToBlock(
  pmNode: PMNode,
  options: MigrationOptions
): MigrationResult {
  try {
    // Extract attributes
    const attrs = pmNode.attrs || {};

    // Determine block ID
    let blockId: string;
    if (options.preserveBlockIds && attrs.blockId) {
      blockId = attrs.blockId;
    } else {
      blockId = nanoid();
    }

    // Determine timestamps
    const now = Date.now();
    let createdAt: number;
    let updatedAt: number;

    if (options.regenerateTimestamps) {
      createdAt = now;
      updatedAt = now;
    } else {
      // Parse ISO timestamps from PM
      createdAt = attrs.createdAt ? new Date(attrs.createdAt).getTime() : now;
      updatedAt = attrs.updatedAt ? new Date(attrs.updatedAt).getTime() : now;
    }

    // Convert content to Lexical JSON
    const lexicalRoot = convertBlockContent(pmNode);
    const content = JSON.stringify(lexicalRoot);

    // Determine block type
    const type = pmTypeToBlockType(pmNode.type, attrs);

    // Create block
    const block: Block = {
      id: blockId,
      type,
      parent: null, // Will be set based on indent in second pass
      children: [], // Will be computed based on indent in second pass
      content,
      description: attrs.description || undefined,
      properties: {
        // Preserve all custom properties
        indent: attrs.indent || 0,
        collapsed: attrs.collapsed || false,
        tags: attrs.tags || [],

        // List-specific
        ...(attrs.listType && { listType: attrs.listType }),
        ...(attrs.checked !== undefined &&
          attrs.checked !== null && { checked: attrs.checked }),
        ...(attrs.priority !== undefined && { priority: attrs.priority }),

        // Heading-specific
        ...(attrs.headingLevel && { headingLevel: attrs.headingLevel }),

        // Code-specific
        ...(attrs.language && { language: attrs.language }),
      },
      createdAt,
      updatedAt,
    };

    return {
      success: true,
      block,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build parent/children relationships based on indent
 *
 * Uses the flat model where indent determines hierarchy:
 * - indent 0 = root block
 * - indent 1 = child of previous indent 0 block
 * - indent 2 = child of previous indent 1 block
 * etc.
 */
function buildTreeStructure(blocks: Block[]): void {
  // Stack to track the last block at each indent level
  const stack: Array<Block | null> = [];

  for (const block of blocks) {
    const indent = (block.properties.indent as number) || 0;

    // Trim stack to current indent level
    stack.length = indent + 1;

    if (indent === 0) {
      // Root block - no parent
      block.parent = null;
      stack[0] = block;
    } else {
      // Child block - parent is the block at indent-1
      const parent = stack[indent - 1];

      if (parent) {
        block.parent = parent.id;
        parent.children.push(block.id);
      } else {
        // No valid parent - make it a root block
        block.parent = null;
        (block.properties as any).indent = 0;
      }

      stack[indent] = block;
    }
  }
}

/**
 * Migrate entire ProseMirror document
 */
export function migrateDocument(
  pmDoc: PMDocument,
  options: MigrationOptions = {}
): DocumentMigrationResult {
  // Default options
  const opts: Required<MigrationOptions> = {
    skipErrors: options.skipErrors ?? false,
    preserveBlockIds: options.preserveBlockIds ?? true,
    regenerateTimestamps: options.regenerateTimestamps ?? false,
    validateTree: options.validateTree ?? true,
    onProgress: options.onProgress || (() => {}),
  };

  const blocks: Block[] = [];
  const errors: Array<{ blockId?: string; error: string }> = [];
  const warnings: Array<{ blockId?: string; warning: string }> = [];

  // Get all PM nodes
  const pmNodes = pmDoc.content || [];
  const total = pmNodes.length;

  // Convert each PM node to a Block
  for (let i = 0; i < pmNodes.length; i++) {
    const pmNode = pmNodes[i];
    opts.onProgress(i + 1, total, pmNode.attrs?.blockId || undefined);

    const result = convertPMNodeToBlock(pmNode, opts);

    if (result.success && result.block) {
      blocks.push(result.block);
    } else {
      errors.push({
        blockId: pmNode.attrs?.blockId || undefined,
        error: result.error || 'Conversion failed',
      });

      if (!opts.skipErrors) {
        // Stop on first error if skipErrors is false
        break;
      }
    }

    // Add warnings for any issues
    if (result.warnings) {
      warnings.push(
        ...result.warnings.map((warning) => ({
          blockId: result.block?.id,
          warning,
        }))
      );
    }
  }

  // Build parent/children relationships based on indent
  if (blocks.length > 0) {
    buildTreeStructure(blocks);
  }

  // Validate tree structure if requested
  if (opts.validateTree && blocks.length > 0) {
    try {
      const blockMap = new Map(blocks.map((b) => [b.id, b]));
      const rootIds = blocks.filter((b) => !b.parent).map((b) => b.id);

      const validation = validateTree(blockMap, rootIds);

      if (!validation.valid) {
        errors.push({
          error: `Tree validation failed: ${validation.errors.join(', ')}`,
        });
      }

      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings.map((warning) => ({ warning })));
      }
    } catch (error) {
      errors.push({
        error: `Tree validation error: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
    }
  }

  // Build stats
  const stats = {
    totalBlocks: total,
    converted: blocks.length,
    failed: errors.length,
    skipped: total - blocks.length - errors.length,
  };

  return {
    success: errors.length === 0,
    blocks,
    errors,
    warnings,
    stats,
  };
}

/**
 * Migrate single block (for testing or partial migration)
 */
export function migrateBlock(
  pmNode: PMNode,
  options: MigrationOptions = {}
): MigrationResult {
  return convertPMNodeToBlock(pmNode, {
    preserveBlockIds: options.preserveBlockIds ?? true,
    regenerateTimestamps: options.regenerateTimestamps ?? false,
    skipErrors: false,
    validateTree: false,
  });
}
