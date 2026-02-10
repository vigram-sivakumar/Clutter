/**
 * 🔒 ARCHITECTURAL INVARIANT TESTS
 * 
 * These tests MUST NEVER CHANGE.
 * They guard the core architectural guarantees.
 * 
 * If these tests fail, the architecture is broken.
 * If you need to change these tests, the architecture is wrong.
 */

import { describe, it, expect } from 'vitest';
import type { Node, Segment } from '../../engine/NodeKernel';
import { performGuaranteedSplit } from '../split-state-machine';
import { assertValidNode, assertValidCursor, assertSplitPreservesContent } from '../invariants';

describe('🔒 Architectural Invariants', () => {
  describe('Node Structure Invariants', () => {
    it('MUST have segments array', () => {
      const invalidNode = { id: 'test', type: 'paragraph' } as any;
      
      expect(() => assertValidNode(invalidNode)).toThrow('segments must be an array');
    });

    it('MUST NOT have empty text segments', () => {
      const nodeWithEmptySegment: Node = {
        id: 'test' as any,
        type: 'paragraph',
        segments: [{ type: 'text', text: '' }],
        parentId: null,
      };

      expect(() => assertValidNode(nodeWithEmptySegment)).toThrow('Empty text segment');
    });

    it('MUST have valid segment types', () => {
      const nodeWithInvalidSegment: Node = {
        id: 'test' as any,
        type: 'paragraph',
        segments: [{ type: 'invalid' as any, text: 'test' }],
        parentId: null,
      };

      expect(() => assertValidNode(nodeWithInvalidSegment)).toThrow('Unknown segment type');
    });
  });

  describe('Cursor Position Invariants', () => {
    const validNode: Node = {
      id: 'test' as any,
      type: 'paragraph',
      segments: [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ],
      parentId: null,
    };

    it('MUST have non-negative segmentIndex', () => {
      const cursor = { nodeId: 'test' as any, segmentIndex: -1, offset: 0 };
      
      expect(() => assertValidCursor(cursor, validNode)).toThrow('Invalid segmentIndex');
    });

    it('MUST have non-negative offset', () => {
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: -5 };
      
      expect(() => assertValidCursor(cursor, validNode)).toThrow('Invalid offset');
    });

    it('MUST NOT exceed segment bounds', () => {
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: 999 };
      
      expect(() => assertValidCursor(cursor, validNode)).toThrow('exceeds text length');
    });
  });

  describe('Split Operation Invariants', () => {
    it('MUST preserve content when splitting', () => {
      const segments: Segment[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ];
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: 3 };

      const { head, tail } = performGuaranteedSplit(segments, cursor);

      // Should not throw
      expect(() => assertSplitPreservesContent(segments, head, tail)).not.toThrow();

      // Content should match
      const originalText = 'helloworld';
      const splitText = head.map(s => s.type === 'text' ? s.text : '').join('') +
                        tail.map(s => s.type === 'text' ? s.text : '').join('');
      expect(splitText).toBe(originalText);
    });

    it('MUST produce correct split at start', () => {
      const segments: Segment[] = [{ type: 'text', text: 'hello' }];
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: 0 };

      const { head, tail } = performGuaranteedSplit(segments, cursor);

      expect(head).toEqual([]);
      expect(tail).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('MUST produce correct split at end', () => {
      const segments: Segment[] = [{ type: 'text', text: 'hello' }];
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: 5 };

      const { head, tail } = performGuaranteedSplit(segments, cursor);

      expect(head).toEqual([{ type: 'text', text: 'hello' }]);
      expect(tail).toEqual([]);
    });

    it('MUST produce correct split in middle', () => {
      const segments: Segment[] = [{ type: 'text', text: 'hello' }];
      const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset: 3 };

      const { head, tail } = performGuaranteedSplit(segments, cursor);

      expect(head).toEqual([{ type: 'text', text: 'hel' }]);
      expect(tail).toEqual([{ type: 'text', text: 'lo' }]);
    });
  });

  describe('Enter Key Correctness (Golden Tests)', () => {
    it('NEVER duplicates content', () => {
      const segments: Segment[] = [{ type: 'text', text: 'hello world' }];
      
      // Split at various positions
      const positions = [0, 5, 11];
      
      for (const offset of positions) {
        const cursor = { nodeId: 'test' as any, segmentIndex: 0, offset };
        const { head, tail } = performGuaranteedSplit(segments, cursor);
        
        const headText = head.map(s => s.type === 'text' ? s.text : '').join('');
        const tailText = tail.map(s => s.type === 'text' ? s.text : '').join('');
        
        // Original text should equal head + tail
        expect(headText + tailText).toBe('hello world');
        
        // No character should appear in both head and tail
        if (headText && tailText) {
          const lastHeadChar = headText[headText.length - 1];
          const firstTailChar = tailText[0];
          expect(lastHeadChar).not.toBe(firstTailChar);
        }
      }
    });

    it('NEVER loses content', () => {
      const segments: Segment[] = [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ];
      const cursor = { nodeId: 'test' as any, segmentIndex: 1, offset: 2 };

      const { head, tail } = performGuaranteedSplit(segments, cursor);

      const originalLength = 'helloworld'.length;
      const resultLength = 
        head.map(s => s.type === 'text' ? s.text.length : 1).reduce((a, b) => a + b, 0) +
        tail.map(s => s.type === 'text' ? s.text.length : 1).reduce((a, b) => a + b, 0);

      expect(resultLength).toBe(originalLength);
    });
  });

  describe('UI Cannot Mutate Segments (Type Safety)', () => {
    it('segments should be readonly', () => {
      const node: Node = {
        id: 'test' as any,
        type: 'paragraph',
        segments: [{ type: 'text', text: 'test' }],
        parentId: null,
      };

      // TypeScript should prevent this at compile time
      // @ts-expect-error - segments is readonly
      node.segments.push({ type: 'text', text: 'bad' });

      // @ts-expect-error - segments is readonly
      node.segments = [];
    });
  });
});
