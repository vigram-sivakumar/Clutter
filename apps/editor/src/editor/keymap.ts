/**
 * Keyboard → commands. Enter, Backspace, Tab, Shift+Tab, Ctrl+Z, Ctrl+Shift+Z. Stub rest.
 */

import type { EditorState } from '../engine/engine';
import type { EditorController } from './editor-controller';
import { getSelection } from './selection';
import {
  insertTextCommand,
  splitNodeCommand,
  mergeNodeCommand,
  indentCommand,
  outdentCommand,
} from '../engine/commands';
import type { PrimitiveOp } from '../engine/engine';

let _nextId = 0;

export function computeNextId(state: EditorState): number {
  let max = 0;
  for (const id in state.nodes) {
    const match = id.match(/^n(\d+)$/);
    const num = match ? parseInt(match[1]!, 10) : NaN;
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  return max;
}

export function initIdGenerator(state: EditorState): void {
  _nextId = computeNextId(state);
}

function genId(): string {
  return 'n' + ++_nextId;
}

export function setupKeymap(rootEl: HTMLElement, controller: EditorController): void {
  rootEl.addEventListener('keydown', (e: Event) => {
    const ev = e as KeyboardEvent;
    const state = controller.getState();

    if (ev.ctrlKey && ev.key === 'z') {
      ev.preventDefault();
      controller.setLastSelection(getSelection(rootEl));
      if (ev.shiftKey) {
        controller.redo();
      } else {
        controller.undo();
      }
      return;
    }

    if (ev.key === 'Tab') {
      ev.preventDefault();
      const sel = getSelection(rootEl);
      if (!sel) return;
      const ops = ev.shiftKey ? outdentCommand(state, sel.nodeId) : indentCommand(state, sel.nodeId);
      if (ops.length > 0) {
        controller.setLastSelection(sel);
        controller.dispatch(ev.shiftKey ? 'outdent' : 'indent', ops);
      }
      return;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      const sel = getSelection(rootEl);
      if (!sel) return;
      const newId = genId();
      const ops = splitNodeCommand(state, sel.nodeId, sel.inlineIndex, sel.offset, newId);
      if (ops.length > 0) {
        controller.setLastSelection({ nodeId: newId, inlineIndex: 0, offset: 0 });
        controller.dispatch('split', ops);
      }
      return;
    }

    if (ev.key === 'Backspace') {
      ev.preventDefault();
      const sel = getSelection(rootEl);
      if (!sel) return;
      if (sel.offset === 0) {
        const ops = mergeNodeCommand(state, sel.nodeId);
        if (ops.length > 0) {
          const node = state.nodes[sel.nodeId];
          const parent = node?.parentId ? state.nodes[node.parentId] : undefined;
          const myIndex = parent ? parent.children.indexOf(sel.nodeId) : -1;
          const prevId = myIndex > 0 ? parent!.children[myIndex - 1]! : null;
          let postSel = sel;
          if (prevId) {
            const parentNode = state.nodes[prevId];
            let inlineIndex = 0;
            let offset = 0;
            if (parentNode) {
              for (let i = 0; i < parentNode.inlines.length; i++) {
                if (parentNode.inlines[i]!.type === 'text') {
                  inlineIndex = i;
                  offset = (parentNode.inlines[i] as { text: string }).text.length;
                }
              }
            }
            postSel = { nodeId: prevId, inlineIndex, offset };
          }
          controller.setLastSelection(postSel);
          controller.dispatch('merge', ops);
        }
      } else {
        const node = state.nodes[sel.nodeId];
        const seg = node?.inlines[sel.inlineIndex];
        if (seg && seg.type === 'text') {
          const offset = sel.offset - 1;
          const char = seg.text.slice(offset, offset + 1);
          const ops: PrimitiveOp[] = [
            {
              type: 'DeleteText',
              nodeId: sel.nodeId,
              inlineIndex: sel.inlineIndex,
              offset,
              length: 1,
              deletedText: char,
            },
            { type: 'NormalizeInline', nodeId: sel.nodeId },
          ];
          controller.setLastSelection({ ...sel, offset: sel.offset - 1 });
          controller.dispatch('backspace', ops);
        }
      }
      return;
    }

    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      const sel = getSelection(rootEl);
      if (!sel) return;
      const ops = insertTextCommand(state, sel.nodeId, sel.inlineIndex, sel.offset, ev.key);
      if (ops.length > 0) {
        controller.setLastSelection({ ...sel, offset: sel.offset + 1 });
        controller.dispatch('insertText', ops);
      }
      return;
    }
  });
}
