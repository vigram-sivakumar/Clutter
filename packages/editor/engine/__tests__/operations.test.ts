/**
 * Block Operations Tests
 *
 * Test all pure operation functions to ensure correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { nanoid } from 'nanoid';
import type { Block } from '../types';
import * as operations from '../operations';
import { validateTree, getDescendantIds } from '../utils';

/**
 * Helper: Create a test block
 */
function createTestBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: nanoid(),
    type: 'paragraph',
    parent: null,
    children: [],
    content: '',
    properties: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('insertBlock', () => {
  it('should insert block as first root when afterId is null', () => {
    const blocks = new Map<string, Block>();
    const newBlock = createTestBlock({ content: 'Hello' });

    const result = operations.insertBlock(blocks, null, newBlock);

    expect(result.has(newBlock.id)).toBe(true);
    expect(result.get(newBlock.id)?.parent).toBe(null);
  });

  it('should insert block after target block', () => {
    const blockA = createTestBlock({ id: 'a', content: 'A' });
    const blocks = new Map([['a', blockA]]);
    const newBlock = createTestBlock({ id: 'b', content: 'B' });

    const result = operations.insertBlock(blocks, 'a', newBlock);

    expect(result.has('b')).toBe(true);
    expect(result.get('b')?.parent).toBe(null);
  });

  it('should update parent children array when inserting', () => {
    const parent = createTestBlock({ id: 'parent', children: ['a', 'c'] });
    const childA = createTestBlock({ id: 'a', parent: 'parent' });
    const childC = createTestBlock({ id: 'c', parent: 'parent' });
    const blocks = new Map([
      ['parent', parent],
      ['a', childA],
      ['c', childC],
    ]);

    const newBlock = createTestBlock({ id: 'b' });
    const result = operations.insertBlock(blocks, 'a', newBlock);

    const updatedParent = result.get('parent');
    expect(updatedParent?.children).toEqual(['a', 'b', 'c']);
  });

  it('should throw if block ID already exists', () => {
    const blockA = createTestBlock({ id: 'a' });
    const blocks = new Map([['a', blockA]]);
    const duplicate = createTestBlock({ id: 'a' });

    expect(() => operations.insertBlock(blocks, null, duplicate)).toThrow();
  });
});

describe('deleteBlock', () => {
  it('should delete a single block', () => {
    const blockA = createTestBlock({ id: 'a' });
    const blocks = new Map([['a', blockA]]);

    const result = operations.deleteBlock(blocks, 'a');

    expect(result.has('a')).toBe(false);
  });

  it('should delete block and descendants', () => {
    const parent = createTestBlock({ id: 'parent', children: ['child'] });
    const child = createTestBlock({
      id: 'child',
      parent: 'parent',
      children: ['grandchild'],
    });
    const grandchild = createTestBlock({ id: 'grandchild', parent: 'child' });
    const blocks = new Map([
      ['parent', parent],
      ['child', child],
      ['grandchild', grandchild],
    ]);

    const result = operations.deleteBlock(blocks, 'child', true);

    expect(result.has('child')).toBe(false);
    expect(result.has('grandchild')).toBe(false);
    expect(result.has('parent')).toBe(true);
  });

  it('should update parent children array', () => {
    const parent = createTestBlock({ id: 'parent', children: ['a', 'b'] });
    const childA = createTestBlock({ id: 'a', parent: 'parent' });
    const childB = createTestBlock({ id: 'b', parent: 'parent' });
    const blocks = new Map([
      ['parent', parent],
      ['a', childA],
      ['b', childB],
    ]);

    const result = operations.deleteBlock(blocks, 'a');

    const updatedParent = result.get('parent');
    expect(updatedParent?.children).toEqual(['b']);
  });
});

describe('moveBlock', () => {
  it('should move block to new parent', () => {
    const parent1 = createTestBlock({ id: 'p1', children: ['a'] });
    const parent2 = createTestBlock({ id: 'p2', children: [] });
    const childA = createTestBlock({ id: 'a', parent: 'p1' });
    const blocks = new Map([
      ['p1', parent1],
      ['p2', parent2],
      ['a', childA],
    ]);

    const result = operations.moveBlock(blocks, 'a', 'p2', 0);

    expect(result.get('a')?.parent).toBe('p2');
    expect(result.get('p1')?.children).toEqual([]);
    expect(result.get('p2')?.children).toEqual(['a']);
  });

  it('should move block to root level', () => {
    const parent = createTestBlock({ id: 'parent', children: ['a'] });
    const childA = createTestBlock({ id: 'a', parent: 'parent' });
    const blocks = new Map([
      ['parent', parent],
      ['a', childA],
    ]);

    const result = operations.moveBlock(blocks, 'a', null, 0);

    expect(result.get('a')?.parent).toBe(null);
    expect(result.get('parent')?.children).toEqual([]);
  });

  it('should throw if moving block to itself', () => {
    const blockA = createTestBlock({ id: 'a' });
    const blocks = new Map([['a', blockA]]);

    expect(() => operations.moveBlock(blocks, 'a', 'a', 0)).toThrow();
  });
});

describe('splitBlock', () => {
  it('should split content at offset', () => {
    const blockA = createTestBlock({ id: 'a', content: 'Hello World' });
    const blocks = new Map([['a', blockA]]);

    const result = operations.splitBlock(blocks, 'a', 5);

    // ✅ New behavior: splitBlock creates empty new block
    // Content splitting is handled by Lexical's Enter handler
    expect(result.blocks.get('a')?.content).toBe('Hello World');
    const newBlock = result.blocks.get(result.newBlockId);
    expect(newBlock?.content).toBe('');
  });

  it('should create new block with same type and parent', () => {
    const parent = createTestBlock({ id: 'parent', children: ['a'] });
    const blockA = createTestBlock({
      id: 'a',
      parent: 'parent',
      type: 'heading',
      content: 'Hello World',
    });
    const blocks = new Map([
      ['parent', parent],
      ['a', blockA],
    ]);

    const result = operations.splitBlock(blocks, 'a', 5);

    const newBlock = result.blocks.get(result.newBlockId);
    expect(newBlock?.type).toBe('heading');
    expect(newBlock?.parent).toBe('parent');
  });

  it('should update parent children array', () => {
    const parent = createTestBlock({ id: 'parent', children: ['a'] });
    const blockA = createTestBlock({
      id: 'a',
      parent: 'parent',
      content: 'Hello World',
    });
    const blocks = new Map([
      ['parent', parent],
      ['a', blockA],
    ]);

    const result = operations.splitBlock(blocks, 'a', 5);

    const updatedParent = result.blocks.get('parent');
    expect(updatedParent?.children).toHaveLength(2);
    expect(updatedParent?.children[0]).toBe('a');
    expect(updatedParent?.children[1]).toBe(result.newBlockId);
  });
});

describe('mergeBlocks', () => {
  it('should merge content from source to target', () => {
    const target = createTestBlock({ id: 'target', content: 'Hello' });
    const source = createTestBlock({ id: 'source', content: ' World' });
    const blocks = new Map([
      ['target', target],
      ['source', source],
    ]);

    const result = operations.mergeBlocks(blocks, 'source', 'target');

    expect(result.blocks.get('target')?.content).toBe('Hello World');
    expect(result.blocks.has('source')).toBe(false);
    expect(result.cursorOffset).toBe(5); // Length of "Hello"
  });

  it('should move children from source to target', () => {
    const target = createTestBlock({ id: 'target', children: [] });
    const source = createTestBlock({ id: 'source', children: ['child'] });
    const child = createTestBlock({ id: 'child', parent: 'source' });
    const blocks = new Map([
      ['target', target],
      ['source', source],
      ['child', child],
    ]);

    const result = operations.mergeBlocks(blocks, 'source', 'target');

    expect(result.blocks.get('target')?.children).toEqual(['child']);
    expect(result.blocks.get('child')?.parent).toBe('target');
  });
});

describe('updateContent', () => {
  it('should update block content', () => {
    const blockA = createTestBlock({ id: 'a', content: 'Old' });
    const blocks = new Map([['a', blockA]]);

    const result = operations.updateContent(blocks, 'a', 'New');

    expect(result.get('a')?.content).toBe('New');
  });

  it('should throw if block not found', () => {
    const blocks = new Map<string, Block>();

    expect(() =>
      operations.updateContent(blocks, 'nonexistent', 'New')
    ).toThrow();
  });
});

describe('updateDescription', () => {
  it('should add description', () => {
    const blockA = createTestBlock({ id: 'a' });
    const blocks = new Map([['a', blockA]]);

    const result = operations.updateDescription(blocks, 'a', 'Description');

    expect(result.get('a')?.description).toBe('Description');
  });

  it('should remove description when undefined', () => {
    const blockA = createTestBlock({ id: 'a', description: 'Old' });
    const blocks = new Map([['a', blockA]]);

    const result = operations.updateDescription(blocks, 'a', undefined);

    expect(result.get('a')?.description).toBeUndefined();
  });
});

describe('Tree Integrity', () => {
  it('should maintain valid tree after multiple operations', () => {
    let blocks = new Map<string, Block>();

    // Create root
    const root = createTestBlock({ id: 'root' });
    blocks = operations.insertBlock(blocks, null, root);

    // Add children
    const child1 = createTestBlock({ id: 'child1' });
    blocks = operations.insertBlock(blocks, 'root', child1);

    const child2 = createTestBlock({ id: 'child2' });
    blocks = operations.insertBlock(blocks, 'child1', child2);

    // Move child
    blocks = operations.moveBlock(blocks, 'child2', 'root', 0);

    // Validate tree
    expect(() => validateTree(blocks)).not.toThrow();
  });
});
