/**
 * KeyboardHandlers.test.ts
 * 
 * Unit tests for pure keyboard handlers.
 * 
 * Tests that handlers:
 * - Are pure functions
 * - Return correct actions
 * - Handle guards correctly
 * - Set preventDefault/stopPropagation correctly
 * 
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  handleEnter,
  handleBackspace,
  handleArrow,
  handleTab,
  handleKeyboardEvent,
} from '../../keyboard';
import type { EditorStateComplete } from '../../core/EditorTypes';
import type { Node, NodeID } from '../../engine';

// Helper to create minimal test state
function createTestState(nodeId: NodeID = '1' as NodeID): EditorStateComplete {
  return {
    nodes: [
      {
        id: nodeId,
        indent: 0,
        segments: [{ type: 'text', text: 'Test' }],
      } as Node,
    ],
    cursor: {
      nodeId,
      segmentIndex: 0,
      offset: 0,
    },
    selection: {
      anchor: null,
      focus: null,
    },
    focusRootId: null,
    grammarSession: {
      isActive: false,
      candidates: [],
      selectedIndex: 0,
    },
    isComposing: false,
  };
}

// Helper to create keyboard event mock
function createKeyEvent(key: string, options: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent {
  return {
    key,
    repeat: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: () => {},
    stopPropagation: () => {},
    ...options,
  } as React.KeyboardEvent;
}

describe('KeyboardHandlers', () => {
  describe('handleEnter', () => {
    it('should return ENTER_PRESSED action', () => {
      const state = createTestState();
      const event = createKeyEvent('Enter');

      const result = handleEnter(state, event, false);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('ENTER_PRESSED');
      expect(result.preventDefault).toBe(true);
      expect(result.stopPropagation).toBe(true);
      expect(result.isStructural).toBe(true);
      expect(result.requestCaret).toBe(true);
    });

    it('should return null when composing', () => {
      const state = createTestState();
      const event = createKeyEvent('Enter');

      const result = handleEnter(state, event, true);

      expect(result.action).toBeNull();
    });

    it('should return null when repeat', () => {
      const state = createTestState();
      const event = createKeyEvent('Enter', { repeat: true });

      const result = handleEnter(state, event, false);

      expect(result.action).toBeNull();
    });

    it('should include cursor and nodes in action payload', () => {
      const state = createTestState();
      const event = createKeyEvent('Enter');

      const result = handleEnter(state, event, false);

      expect(result.action?.payload.cursor).toBe(state.cursor);
      expect(result.action?.payload.nodes).toBe(state.nodes);
    });
  });

  describe('handleBackspace', () => {
    it('should return BACKSPACE_PRESSED action', () => {
      const state = createTestState();
      const event = createKeyEvent('Backspace');

      const result = handleBackspace(state, event, false);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('BACKSPACE_PRESSED');
      expect(result.isStructural).toBe(true);
      expect(result.requestCaret).toBe(true);
    });

    it('should return null when composing', () => {
      const state = createTestState();
      const event = createKeyEvent('Backspace');

      const result = handleBackspace(state, event, true);

      expect(result.action).toBeNull();
    });

    it('should return null when repeat', () => {
      const state = createTestState();
      const event = createKeyEvent('Backspace', { repeat: true });

      const result = handleBackspace(state, event, false);

      expect(result.action).toBeNull();
    });

    it('should return null when selection exists', () => {
      // Mock window.getSelection
      const mockSelection = {
        isCollapsed: false,
      } as Selection;

      global.window = {
        getSelection: () => mockSelection,
      } as any;

      const state = createTestState();
      const event = createKeyEvent('Backspace');

      const result = handleBackspace(state, event, false);

      expect(result.action).toBeNull();
    });
  });

  describe('handleArrow', () => {
    it('should return ARROW_PRESSED action for up', () => {
      const state = createTestState();
      const event = createKeyEvent('ArrowUp');

      const result = handleArrow(state, event);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('ARROW_PRESSED');
      expect(result.action?.payload.direction).toBe('up');
      expect(result.preventDefault).toBe(true);
      expect(result.isStructural).toBe(false);
      expect(result.requestCaret).toBe(true);
    });

    it('should return ARROW_PRESSED action for down', () => {
      const state = createTestState();
      const event = createKeyEvent('ArrowDown');

      const result = handleArrow(state, event);

      expect(result.action?.payload.direction).toBe('down');
    });

    it('should return null for left arrow', () => {
      const state = createTestState();
      const event = createKeyEvent('ArrowLeft');

      const result = handleArrow(state, event);

      expect(result.action).toBeNull();
    });

    it('should return null for right arrow', () => {
      const state = createTestState();
      const event = createKeyEvent('ArrowRight');

      const result = handleArrow(state, event);

      expect(result.action).toBeNull();
    });
  });

  describe('handleTab', () => {
    it('should return TAB_PRESSED action for indent', () => {
      const state = createTestState();
      const event = createKeyEvent('Tab');

      const result = handleTab(state, event);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('TAB_PRESSED');
      expect(result.action?.payload.shiftKey).toBe(false);
      expect(result.preventDefault).toBe(true);
      expect(result.isStructural).toBe(true);
      expect(result.requestCaret).toBe(false);
    });

    it('should return TAB_PRESSED action for outdent', () => {
      const state = createTestState();
      const event = createKeyEvent('Tab', { shiftKey: true });

      const result = handleTab(state, event);

      expect(result.action?.payload.shiftKey).toBe(true);
    });
  });

  describe('handleKeyboardEvent', () => {
    it('should route Enter to handleEnter', () => {
      const state = createTestState();
      const event = createKeyEvent('Enter');

      const result = handleKeyboardEvent(state, event, false);

      expect(result.action?.type).toBe('ENTER_PRESSED');
    });

    it('should route Backspace to handleBackspace', () => {
      const state = createTestState();
      const event = createKeyEvent('Backspace');

      // Mock selection as collapsed
      global.window = {
        getSelection: () => ({ isCollapsed: true } as Selection),
      } as any;

      const result = handleKeyboardEvent(state, event, false);

      expect(result.action?.type).toBe('BACKSPACE_PRESSED');
    });

    it('should route ArrowUp to handleArrow', () => {
      const state = createTestState();
      const event = createKeyEvent('ArrowUp');

      const result = handleKeyboardEvent(state, event, false);

      expect(result.action?.type).toBe('ARROW_PRESSED');
    });

    it('should route Tab to handleTab', () => {
      const state = createTestState();
      const event = createKeyEvent('Tab');

      const result = handleKeyboardEvent(state, event, false);

      expect(result.action?.type).toBe('TAB_PRESSED');
    });

    it('should return null for unhandled keys', () => {
      const state = createTestState();
      const event = createKeyEvent('x');

      const result = handleKeyboardEvent(state, event, false);

      expect(result.action).toBeNull();
    });
  });
});
