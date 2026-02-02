/**
 * Synthetic Corpus for Migration Validation
 *
 * These are NOT real user documents.
 * These are canonical edge cases representing future risk.
 *
 * Gate condition: Migration must pass all cases without:
 * - Throwing exceptions
 * - Losing text content
 * - Producing invalid trees
 * - Silently dropping data
 */

import { PMDocument } from '../types';

/**
 * Test Case 1: Empty Document
 *
 * Risk: Null/undefined handling, empty arrays
 * Expected: 0 blocks (valid empty state)
 */
export const EMPTY_DOC: PMDocument = {
  type: 'doc',
  content: [],
};

/**
 * Test Case 2: Single Paragraph with Plain Text
 *
 * Risk: Basic conversion path
 * Expected: 1 block, plain text preserved
 */
export const SINGLE_PARAGRAPH: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [
        {
          type: 'text',
          text: 'Hello world',
        },
      ],
    },
  ],
};

/**
 * Test Case 3: Mixed Inline Formatting
 *
 * Risk: Mark conversion, format bitmask calculation
 * Expected: 1 block, all marks converted to Lexical format
 */
export const MIXED_FORMATTING: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [
        {
          type: 'text',
          text: 'Bold',
          marks: [{ type: 'bold' }],
        },
        {
          type: 'text',
          text: ' and ',
        },
        {
          type: 'text',
          text: 'italic',
          marks: [{ type: 'italic' }],
        },
        {
          type: 'text',
          text: ' and ',
        },
        {
          type: 'text',
          text: 'code',
          marks: [{ type: 'code' }],
        },
        {
          type: 'text',
          text: ' and ',
        },
        {
          type: 'text',
          text: 'bold italic',
          marks: [{ type: 'bold' }, { type: 'italic' }],
        },
      ],
    },
  ],
};

/**
 * Test Case 4: Deep Indent Tree
 *
 * Risk: Tree reconstruction from flat indent, parent/children relationships
 * Expected: 7 blocks with correct parent/children hierarchy
 */
export const DEEP_INDENT_TREE: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'root-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Root 1' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'child-1-1',
        indent: 1,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Child 1.1' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'grandchild-1-1-1',
        indent: 2,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Grandchild 1.1.1' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'great-grandchild-1-1-1-1',
        indent: 3,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Great-grandchild 1.1.1.1' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'child-1-2',
        indent: 1,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Child 1.2' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'root-2',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Root 2' }],
    },
    {
      type: 'paragraph',
      attrs: {
        blockId: 'child-2-1',
        indent: 1,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Child 2.1' }],
    },
  ],
};

/**
 * Test Case 5: All Block Types
 *
 * Risk: Node type mapping, special attributes
 * Expected: All types convert correctly
 */
export const ALL_BLOCK_TYPES: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'para-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Paragraph' }],
    },
    {
      type: 'heading',
      attrs: {
        blockId: 'heading-1',
        indent: 0,
        headingLevel: 1,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Heading 1' }],
    },
    {
      type: 'heading',
      attrs: {
        blockId: 'heading-2',
        indent: 0,
        headingLevel: 2,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Heading 2' }],
    },
    {
      type: 'listBlock',
      attrs: {
        blockId: 'list-1',
        indent: 0,
        listType: 'bullet',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Bullet item' }],
    },
    {
      type: 'listBlock',
      attrs: {
        blockId: 'list-2',
        indent: 0,
        listType: 'numbered',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Numbered item' }],
    },
    {
      type: 'listBlock',
      attrs: {
        blockId: 'list-3',
        indent: 0,
        listType: 'todo',
        checked: false,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Todo item' }],
    },
    {
      type: 'blockquote',
      attrs: {
        blockId: 'quote-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Quote block' }],
    },
    {
      type: 'codeBlock',
      attrs: {
        blockId: 'code-1',
        indent: 0,
        language: 'typescript',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'const x = 42;' }],
    },
  ],
};

/**
 * Test Case 6: Pathological Formatting
 *
 * Risk: Nested marks, empty text nodes, edge cases
 * Expected: Graceful handling, no crashes
 */
export const PATHOLOGICAL_FORMATTING: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [
        // Empty text node
        {
          type: 'text',
          text: '',
        },
        // Triple nested marks
        {
          type: 'text',
          text: 'triple',
          marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }],
        },
        // Whitespace-only
        {
          type: 'text',
          text: '   ',
        },
        // Single space with mark
        {
          type: 'text',
          text: ' ',
          marks: [{ type: 'bold' }],
        },
        // Unicode edge case
        {
          type: 'text',
          text: '🎯 emoji',
        },
        // Newline (should be preserved)
        {
          type: 'text',
          text: '\n',
        },
        // All marks combined
        {
          type: 'text',
          text: 'all marks',
          marks: [
            { type: 'bold' },
            { type: 'italic' },
            { type: 'underline' },
            { type: 'strike' },
            { type: 'code' },
          ],
        },
      ],
    },
  ],
};

/**
 * Test Case 7: Missing/Invalid Attributes (Graceful Degradation)
 *
 * Risk: Runtime crashes on missing required fields
 * Expected: Sensible defaults, no crashes
 */
export const INVALID_ATTRS: PMDocument = {
  type: 'doc',
  content: [
    // Missing blockId (should generate)
    {
      type: 'paragraph',
      attrs: {
        indent: 0,
      } as any,
      content: [{ type: 'text', text: 'Missing blockId' }],
    },
    // Missing timestamps (should generate)
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-2',
        indent: 0,
      } as any,
      content: [{ type: 'text', text: 'Missing timestamps' }],
    },
    // Missing indent (should default to 0)
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-3',
      } as any,
      content: [{ type: 'text', text: 'Missing indent' }],
    },
    // Empty content array
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-4',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [],
    },
  ],
};

/**
 * Test Case 8: Block with Description
 *
 * Risk: Description attribute preservation
 * Expected: Description migrated to block.description
 */
export const BLOCK_WITH_DESCRIPTION: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-1',
        indent: 0,
        description: 'This is a description',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Block content' }],
    },
    {
      type: 'heading',
      attrs: {
        blockId: 'block-2',
        indent: 0,
        headingLevel: 1,
        description: 'Heading with description',
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Heading' }],
    },
  ],
};

/**
 * Test Case 9: Unknown Node Type (Future-Proofing)
 *
 * Risk: Hard crashes on unknown types
 * Expected: Graceful degradation to paragraph or skip
 */
export const UNKNOWN_NODE_TYPE: PMDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: {
        blockId: 'block-1',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [{ type: 'text', text: 'Known type' }],
    },
    {
      type: 'futureBlockType' as any,
      attrs: {
        blockId: 'block-2',
        indent: 0,
        createdAt: 1704067200000,
        updatedAt: 1704067200000,
      },
      content: [
        { type: 'text', text: 'Unknown type - should gracefully degrade' },
      ],
    },
  ],
};

/**
 * All test cases in execution order
 */
export const SYNTHETIC_CORPUS = {
  'Empty Document': EMPTY_DOC,
  'Single Paragraph': SINGLE_PARAGRAPH,
  'Mixed Formatting': MIXED_FORMATTING,
  'Deep Indent Tree': DEEP_INDENT_TREE,
  'All Block Types': ALL_BLOCK_TYPES,
  'Pathological Formatting': PATHOLOGICAL_FORMATTING,
  'Invalid Attributes': INVALID_ATTRS,
  'Block with Description': BLOCK_WITH_DESCRIPTION,
  'Unknown Node Type': UNKNOWN_NODE_TYPE,
};

/**
 * Expected outcomes for validation
 */
export const EXPECTED_OUTCOMES = {
  'Empty Document': {
    blockCount: 0,
    shouldSucceed: true,
  },
  'Single Paragraph': {
    blockCount: 1,
    shouldSucceed: true,
    hasText: true,
  },
  'Mixed Formatting': {
    blockCount: 1,
    shouldSucceed: true,
    hasFormatting: true,
  },
  'Deep Indent Tree': {
    blockCount: 7,
    shouldSucceed: true,
    hasTree: true,
    maxDepth: 3,
  },
  'All Block Types': {
    blockCount: 8,
    shouldSucceed: true,
    hasMultipleTypes: true,
  },
  'Pathological Formatting': {
    blockCount: 1,
    shouldSucceed: true,
    hasEdgeCases: true,
  },
  'Invalid Attributes': {
    blockCount: 4,
    shouldSucceed: true, // Should succeed with generated defaults
    hasDefaults: true,
  },
  'Block with Description': {
    blockCount: 2,
    shouldSucceed: true,
    hasDescription: true,
  },
  'Unknown Node Type': {
    blockCount: 1, // Unknown type should be skipped or degraded
    shouldSucceed: true,
    hasGracefulDegradation: true,
  },
};
