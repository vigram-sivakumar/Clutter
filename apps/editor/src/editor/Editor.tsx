/**
 * Editor V2 — Root component. useReducer, flat render, keyboard.
 * Browser owns caret during typing. Reducer + effect only for structural keys (Enter, Backspace, Arrow).
 */

import { useReducer, useEffect, useLayoutEffect, useRef } from 'react';
import type { EditorState } from './model';
import type { Node, NodeID } from './model';
import { reducer } from './reducer';
import { getDepth, isNodeHidden } from './utils';
import { NodeRow } from './NodeRow';
import { layoutTokens } from '../design-system/tokens';

/** Tree node: flat node + depth + children (from projection only; state stays flat). isExpanded set at render from state.collapsed. */
type TreeNode = Node & {
  depth: number;
  children: TreeNode[];
  isExpanded?: boolean;
};

function buildTree(nodes: (Node & { depth: number })[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: TreeNode[] = [];

  for (const node of nodes) {
    const treeNode: TreeNode = { ...node, depth: node.depth, children: [] };

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top == null || top.depth < node.depth) break;
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent == null) {
      root.push(treeNode);
    } else {
      parent.children.push(treeNode);
    }

    stack.push(treeNode);
  }

  return root;
}

const initialNodeId = crypto.randomUUID();
const initialState: EditorState = {
  nodes: [{ id: initialNodeId, text: '', parentId: null }],
  cursor: { nodeId: initialNodeId, offset: 0 },
  collapsed: new Set(),
};

function readSelection(): { nodeId: NodeID; offset: number } | null {
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return null;

  let el: HTMLElement | null =
    sel.anchorNode instanceof Text
      ? sel.anchorNode.parentElement
      : (sel.anchorNode as HTMLElement);

  if (!el) return null;

  el = el.closest('[data-node-id]');
  if (!el) return null;

  const nodeId = el.getAttribute('data-node-id');
  if (!nodeId) return null;

  const textNode =
    sel.anchorNode instanceof Text
      ? sel.anchorNode
      : el.firstChild instanceof Text
        ? el.firstChild
        : null;

  const offset = textNode ? sel.anchorOffset : 0;

  return { nodeId: nodeId as NodeID, offset };
}

export function Editor() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const shouldPlaceCaretRef = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const indentAnimationRef = useRef<{
    nodeId: string;
    prevRect: DOMRect;
  } | null>(null);

  // Sync state.cursor when user clicks (so ENTER uses correct target)
  useEffect(() => {
    function onSelectionChange() {
      const pos = readSelection();
      if (!pos) return;

      dispatch({ type: 'SET_CURSOR', nodeId: pos.nodeId, offset: pos.offset });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [dispatch]);

  // Caret placement only after structural actions (Enter, Backspace, Arrow)
  useEffect(() => {
    if (!shouldPlaceCaretRef.current) return;

    shouldPlaceCaretRef.current = false;

    const { nodeId, offset } = state.cursor;
    const editor = editorRef.current;
    if (!editor) return;

    const el = editor.querySelector(`[data-node-id="${nodeId}"]`);
    if (!el) return;

    const range = document.createRange();
    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNode = walker.nextNode() as Text | null;

    if (textNode) {
      const clamped = Math.min(offset, textNode.textContent?.length ?? 0);
      range.setStart(textNode, clamped);
    } else {
      range.setStart(el, 0);
    }

    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }, [state.cursor, state.nodes]);

  useLayoutEffect(() => {
    const data = indentAnimationRef.current;
    if (!data) return;

    indentAnimationRef.current = null;

    const editor = editorRef.current;
    if (!editor) return;

    const el = editor.querySelector(
      `[data-node-id="${data.nodeId}"]`
    ) as HTMLElement | null;

    if (!el) return;

    const row = el.closest('.clutter-node') as HTMLElement | null;
    if (!row) return;

    const nextRect = row.getBoundingClientRect();

    const deltaX = data.prevRect.left - nextRect.left;
    const deltaY = data.prevRect.top - nextRect.top;

    if (deltaX === 0 && deltaY === 0) return;

    const duration = 340;
    const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

    row.style.transition = 'none';
    row.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    requestAnimationFrame(() => {
      row.style.transition = `transform ${duration}ms ${easing}`;
      row.style.transform = 'translate(0, 0)';
    });
  }, [state.nodes]);

  function handleKeyDown(e: React.KeyboardEvent) {
    const visible = state.nodes.filter(
      (n) => !isNodeHidden(state.nodes, n.id, state.collapsed)
    );

    if (e.key === 'Enter') {
      e.preventDefault();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const pos = readSelection();
      if (!pos) return;

      // 🔥 Empty last-child → OUTDENT (with animation)
      const current = state.nodes.find(n => n.id === pos.nodeId);
      if (!current) return;

      const isEmpty = current.text.trim() === '';

      const visibleIndex = visible.findIndex(n => n.id === pos.nodeId);
      const nextVisible = visible[visibleIndex + 1];

      const isLastVisible =
        !nextVisible || nextVisible.parentId !== current.parentId;

      const depth = getDepth(state.nodes, pos.nodeId);

      if (isEmpty && isLastVisible && depth > 0) {
        // measure BEFORE dispatch (FLIP)
        const editor = editorRef.current;
        const el = editor?.querySelector(
          `[data-node-id="${pos.nodeId}"]`
        ) as HTMLElement | null;

        if (el) {
          const row = el.closest('.clutter-node');
          if (row) {
            indentAnimationRef.current = {
              nodeId: pos.nodeId,
              prevRect: row.getBoundingClientRect(),
            };
          }
        }

        shouldPlaceCaretRef.current = true;

        dispatch({ type: 'OUTDENT', atNodeId: pos.nodeId });

        return;
      }

      // Prevent multi-node selection for now
      const startRow = (range.startContainer as HTMLElement)?.closest?.(
        '[data-node-id]'
      );
      const endRow = (range.endContainer as HTMLElement)?.closest?.(
        '[data-node-id]'
      );
      if (
        startRow?.getAttribute('data-node-id') !==
        endRow?.getAttribute('data-node-id')
      ) {
        return;
      }

      const nodeId = pos.nodeId;

      const node = state.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      let newText = node.text;
      let splitOffset = pos.offset;

      if (!sel.isCollapsed) {
        const start = pos.offset;
        const end = range.endOffset;

        newText = node.text.slice(0, start) + node.text.slice(end);
        splitOffset = start;

        dispatch({ type: 'UPDATE_TEXT', nodeId, text: newText });
      }

      shouldPlaceCaretRef.current = true;

      dispatch({
        type: 'ENTER',
        atNodeId: nodeId,
        atOffset: splitOffset,
      });
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (!sel) return;

      // If there is a range selection (Ctrl+A or drag select)
      if (!sel.isCollapsed) {
        // Let browser delete normally
        return;
      }

      const pos = readSelection();
      if (!pos) return;

      if (pos.offset === 0) {
        e.preventDefault();
        shouldPlaceCaretRef.current = true;
        dispatch({ type: 'BACKSPACE', atNodeId: pos.nodeId });
      }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = readSelection();
      if (!pos) return;

      const idx = visible.findIndex((n) => n.id === pos.nodeId);
      if (idx <= 0) return;

      const target = visible[idx - 1];
      if (!target) return;
      const offset = Math.min(pos.offset, target.text.length);

      shouldPlaceCaretRef.current = true;
      dispatch({ type: 'SET_CURSOR', nodeId: target.id, offset });
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const pos = readSelection();
      if (!pos) return;

      const idx = visible.findIndex((n) => n.id === pos.nodeId);
      if (idx < 0 || idx >= visible.length - 1) return;

      const target = visible[idx + 1];
      if (!target) return;
      const offset = Math.min(pos.offset, target.text.length);

      shouldPlaceCaretRef.current = true;
      dispatch({ type: 'SET_CURSOR', nodeId: target.id, offset });
    }
    if (e.key === 'ArrowRight') {
      const pos = readSelection();
      if (!pos) return;

      const idx = visible.findIndex((n) => n.id === pos.nodeId);
      const node = visible[idx];
      if (!node) return;

      if (pos.offset === node.text.length) {
        const target = visible[idx + 1];
        if (target) {
          e.preventDefault();
          shouldPlaceCaretRef.current = true;
          dispatch({ type: 'SET_CURSOR', nodeId: target.id, offset: 0 });
        }
      }
    }
    if (e.key === 'ArrowLeft') {
      const pos = readSelection();
      if (!pos) return;

      const idx = visible.findIndex((n) => n.id === pos.nodeId);
      if (idx <= 0) return;

      if (pos.offset === 0) {
        const target = visible[idx - 1];
        if (target) {
          e.preventDefault();
          shouldPlaceCaretRef.current = true;
          dispatch({
            type: 'SET_CURSOR',
            nodeId: target.id,
            offset: target.text.length,
          });
        }
      }
    }
    if (e.ctrlKey && e.key === '.') {
      e.preventDefault();
      const pos = readSelection();
      if (!pos) return;

      dispatch({ type: 'TOGGLE_COLLAPSE', nodeId: pos.nodeId });
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const pos = readSelection();
      if (!pos) return;

      const editor = editorRef.current;
      const el = editor?.querySelector(
        `[data-node-id="${pos.nodeId}"]`
      ) as HTMLElement | null;

      if (el) {
        const row = el.closest('.clutter-node');
        if (row) {
          indentAnimationRef.current = {
            nodeId: pos.nodeId,
            prevRect: row.getBoundingClientRect(),
          };
        }
      }

      shouldPlaceCaretRef.current = true;

      if (e.shiftKey) {
        dispatch({ type: 'OUTDENT', atNodeId: pos.nodeId });
      } else {
        dispatch({ type: 'INDENT', atNodeId: pos.nodeId });
      }
    }
  }

  const allWithDepth = state.nodes.map((node) => ({
    ...node,
    depth: getDepth(state.nodes, node.id),
  }));
  const tree = buildTree(allWithDepth);

  const rootNodes = state.nodes.filter((n) => n.parentId === null);
  const lastRoot = rootNodes[rootNodes.length - 1];

  function renderTreeNode(node: TreeNode) {
    const isExpanded = node.isExpanded === true;
    const hasChildren =
      node.children && node.children.length > 0;
    const isSystemic =
      node.parentId === null && lastRoot != null && node.id === lastRoot.id;
    const isEmpty = node.text.trim() === '';
    const active = state.cursor.nodeId === node.id;
    const effectiveActive =
      active && (!isSystemic || node.text.trim() !== '');

    return (
      <div
        key={node.id}
        className={[
          'clutter-node',
          hasChildren && isExpanded === false
            ? 'clutter-node--collapsed-parent'
            : '',
          isSystemic ? 'clutter-node--systemic' : '',
          isEmpty ? 'clutter-node--empty' : '',
        ].filter(Boolean).join(' ')}
        data-depth={node.depth}
        data-active={effectiveActive ? 'true' : 'false'}
      >
        <NodeRow
          node={node}
          depth={node.depth}
          isActive={active}
          nodes={state.nodes}
          collapsed={state.collapsed}
          dispatch={dispatch}
          renderInnerOnly
        />
        {isExpanded && hasChildren && (
          <div className="clutter-node__children">
            {node.children
              .filter((child) =>
                !isNodeHidden(state.nodes, child.id, state.collapsed)
              )
              .map((child) =>
                renderTreeNode({
                  ...child,
                  isExpanded: !state.collapsed.has(child.id),
                })
              )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={editorRef}
      className="clutter-editor"
      onKeyDown={handleKeyDown}
      style={{ '--indent': `${layoutTokens.indent}px` } as React.CSSProperties}
    >
      {tree.map((node) =>
        renderTreeNode({
          ...node,
          isExpanded: !state.collapsed.has(node.id),
        })
      )}
    </div>
  );
}
