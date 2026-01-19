/**
 * Callout Node - Colored callout blocks (info, warning, error, success)
 *
 * Block element with colored left border and background.
 * Contains inline content (text with marks).
 */

import { Node, mergeAttributes } from '@tiptap/react';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Callout as CalloutComponent } from '../../components/Callout';
import {
  createShiftEnterHandler,
  createWrapperEnterHandler,
  createWrapperBackspaceHandler,
} from '../../utils/keyboardHelpers';
import { EnterRules } from '../../utils/keyboardRules';

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules

export interface CalloutAttrs {
  type: 'info' | 'warning' | 'error' | 'success';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: CalloutAttrs) => ReturnType;
      toggleCallout: (attrs?: CalloutAttrs) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',

  // ❌ REMOVED: priority: 1000 was breaking composition input
  // Keyboard handlers should not interfere with ProseMirror's input system
  // priority: 1000,

  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || null,
        renderHTML: (attributes) => {
          if (attributes.blockId) {
            return { 'data-block-id': attributes.blockId };
          }
          return {};
        },
      },
      type: {
        default: 'info',
        parseHTML: (element) =>
          element.getAttribute('data-callout-type') || 'info',
        renderHTML: (attributes) => {
          return {
            'data-callout-type': attributes.type,
          };
        },
      },
      // 🔥 FLAT MODEL: indent is the ONLY structural attribute
      indent: {
        default: 0,
        parseHTML: (element) =>
          parseInt(element.getAttribute('data-indent') || '0', 10),
        renderHTML: (attributes) => ({
          'data-indent': attributes.indent || 0,
        }),
      },
      // 🔒 COLLAPSE CONTRACT: All structural blocks must have collapsed attribute
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({
          'data-collapsed': attributes.collapsed || false,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutComponent) as any;
  },
  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs);
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs);
        },
    };
  },
  addKeyboardShortcuts() {
    // NOTE: Tab / Shift+Tab behavior is centrally handled
    // via keyboard rules emitting indent-block / outdent-block intents.
    // Node extensions must not handle structural keyboard logic.
    return {
      'Shift-Enter': createShiftEnterHandler('callout'),

      // 🔒 Enter - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Enter behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      Enter: () => {
        return false; // Delegate to KeyboardEngine
      },

      // 🔒 Backspace - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Backspace behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      Backspace: () => {
        return false; // Delegate to KeyboardEngine
      },
    };
  },
});
