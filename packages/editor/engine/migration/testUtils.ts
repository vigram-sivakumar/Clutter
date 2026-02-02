/**
 * Migration Test Utilities
 *
 * Helper functions for testing migrations.
 */

import type { PMDocument, PMNode } from './types';
import { migrateDocument, migrateBlock } from './migrateDocument';

/**
 * Create sample PM document for testing
 */
export function createSamplePMDocument(): PMDocument {
  return {
    type: 'doc',
    content: [
      // Paragraph
      {
        type: 'paragraph',
        attrs: {
          blockId: 'test-p1',
          indent: 0,
          collapsed: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          description: 'Test paragraph',
        },
        content: [
          {
            type: 'text',
            text: 'Hello ',
          },
          {
            type: 'text',
            text: 'bold',
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
            text: ' text',
          },
        ],
      },

      // Heading
      {
        type: 'heading',
        attrs: {
          blockId: 'test-h1',
          headingLevel: 1,
          indent: 0,
          collapsed: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        content: [
          {
            type: 'text',
            text: 'Main Heading',
          },
        ],
      },

      // Indented paragraph
      {
        type: 'paragraph',
        attrs: {
          blockId: 'test-p2',
          indent: 1,
          collapsed: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        content: [
          {
            type: 'text',
            text: 'Indented content',
          },
        ],
      },

      // List item
      {
        type: 'listBlock',
        attrs: {
          blockId: 'test-li1',
          listType: 'bullet',
          indent: 0,
          collapsed: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        content: [
          {
            type: 'text',
            text: 'Bullet point',
          },
        ],
      },

      // Code block
      {
        type: 'codeBlock',
        attrs: {
          blockId: 'test-code',
          language: 'typescript',
          indent: 0,
          collapsed: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        content: [
          {
            type: 'text',
            text: 'const x = 42;',
          },
        ],
      },
    ],
  };
}

/**
 * Test migration with console output
 */
export function testMigration(): void {
  console.log('🧪 Testing Document Migration\n');

  const pmDoc = createSamplePMDocument();

  console.log('📄 Sample PM Document:');
  console.log(JSON.stringify(pmDoc, null, 2));
  console.log('\n');

  const result = migrateDocument(pmDoc, {
    preserveBlockIds: true,
    regenerateTimestamps: false,
    validateTree: true,
    onProgress: (current, total, blockId) => {
      console.log(
        `⏳ Converting block ${current}/${total} ${blockId ? `(${blockId})` : ''}`
      );
    },
  });

  console.log('\n📊 Migration Result:');
  console.log(`Success: ${result.success}`);
  console.log(
    `Blocks converted: ${result.stats.converted}/${result.stats.totalBlocks}`
  );
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach((err) => {
      console.log(`  - ${err.blockId ? `[${err.blockId}]` : ''} ${err.error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warn) => {
      console.log(
        `  - ${warn.blockId ? `[${warn.blockId}]` : ''} ${warn.warning}`
      );
    });
  }

  console.log('\n📦 Converted Blocks:');
  result.blocks.forEach((block) => {
    console.log(`\n  Block: ${block.id}`);
    console.log(`  Type: ${block.type}`);
    console.log(`  Parent: ${block.parent || 'null'}`);
    console.log(`  Children: [${block.children.join(', ')}]`);
    console.log(`  Description: ${block.description || 'none'}`);
    console.log(
      `  Content (first 100 chars): ${block.content.substring(0, 100)}...`
    );
  });

  console.log('\n✅ Migration test complete!');
}

/**
 * Test single block migration
 */
export function testBlockMigration(): void {
  console.log('🧪 Testing Single Block Migration\n');

  const pmNode: PMNode = {
    type: 'paragraph',
    attrs: {
      blockId: 'test-single',
      indent: 0,
      collapsed: false,
    },
    content: [
      { type: 'text', text: 'Simple ' },
      {
        type: 'text',
        text: 'formatted',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      },
      { type: 'text', text: ' text' },
    ],
  };

  console.log('📄 PM Node:');
  console.log(JSON.stringify(pmNode, null, 2));

  const result = migrateBlock(pmNode);

  console.log('\n📊 Result:');
  console.log(`Success: ${result.success}`);

  if (result.block) {
    console.log('\n📦 Block:');
    console.log(JSON.stringify(result.block, null, 2));

    console.log('\n📝 Lexical Content:');
    const content = JSON.parse(result.block.content);
    console.log(JSON.stringify(content, null, 2));
  }

  if (result.error) {
    console.log('\n❌ Error:', result.error);
  }

  console.log('\n✅ Block migration test complete!');
}
