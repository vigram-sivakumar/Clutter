/**
 * NodeView — DUMB RECURSIVE RENDERER
 *
 * This is a minimal view component that:
 * - Renders a bullet
 * - Renders editable text (simple contenteditable for now)
 * - Renders children recursively
 * - Handles expand/collapse
 *
 * NO LOGIC. NO KEYBOARD POLICY. NO SIDE EFFECTS.
 *
 * Just pure rendering based on node data.
 */

import React from 'react';
import { NodeID } from './NodeKernel';
import { NodeStore } from './NodeStore';

export interface NodeViewProps {
  /** ID of the node to render */
  nodeId: NodeID;

  /** Store to read node data from */
  store: NodeStore;

  /** Callback when text changes */
  onTextChange?: (nodeId: NodeID, text: string) => void;

  /** Callback when collapse state changes */
  onToggleCollapse?: (nodeId: NodeID) => void;

  /** Callback when Enter is pressed */
  onEnter?: (nodeId: NodeID, cursorOffset: number) => void;

  /** Callback when Backspace is pressed */
  onBackspace?: (nodeId: NodeID, cursorOffset: number) => void;

  /** Callback when Tab is pressed */
  onTab?: (nodeId: NodeID) => void;

  /** Callback when Shift+Tab is pressed */
  onShiftTab?: (nodeId: NodeID) => void;
}

/**
 * NodeView — Renders a single node and its children
 */
export function NodeView({
  nodeId,
  store,
  onTextChange,
  onToggleCollapse,
  onEnter,
  onBackspace,
  onTab,
  onShiftTab,
}: NodeViewProps) {
  const node = store.getNode(nodeId);

  if (!node) {
    return null;
  }

  const hasChildren = node.children.length > 0;

  // Handle text input
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent || '';
    onTextChange?.(nodeId, text);
  };

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const selection = window.getSelection();
    const cursorOffset = selection?.anchorOffset || 0;

    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.(nodeId, cursorOffset);
    } else if (e.key === 'Backspace') {
      if (cursorOffset === 0) {
        e.preventDefault();
        onBackspace?.(nodeId, cursorOffset);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        onShiftTab?.(nodeId);
      } else {
        onTab?.(nodeId);
      }
    }
  };

  // Handle collapse toggle
  const handleToggleCollapse = () => {
    onToggleCollapse?.(nodeId);
  };

  return (
    <div style={{ marginLeft: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Collapse/expand button (only if has children) */}
        {hasChildren && (
          <button
            onClick={handleToggleCollapse}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '0',
              fontSize: '12px',
            }}
          >
            {node.collapsed ? '▶' : '▼'}
          </button>
        )}

        {/* Bullet */}
        {!hasChildren && (
          <span style={{ fontSize: '12px', color: '#888' }}>•</span>
        )}

        {/* Editable text */}
        <div
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          style={{
            outline: 'none',
            padding: '4px',
            minWidth: '200px',
            border: '1px solid transparent',
          }}
        >
          {node.text}
        </div>
      </div>

      {/* Children (recursive) */}
      {hasChildren && !node.collapsed && (
        <div>
          {node.children.map((childId) => (
            <NodeView
              key={childId}
              nodeId={childId}
              store={store}
              onTextChange={onTextChange}
              onToggleCollapse={onToggleCollapse}
              onEnter={onEnter}
              onBackspace={onBackspace}
              onTab={onTab}
              onShiftTab={onShiftTab}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * RootView — Renders all root-level nodes
 */
export interface RootViewProps {
  store: NodeStore;
  onTextChange?: (nodeId: NodeID, text: string) => void;
  onToggleCollapse?: (nodeId: NodeID) => void;
  onEnter?: (nodeId: NodeID, cursorOffset: number) => void;
  onBackspace?: (nodeId: NodeID, cursorOffset: number) => void;
  onTab?: (nodeId: NodeID) => void;
  onShiftTab?: (nodeId: NodeID) => void;
}

export function RootView({
  store,
  onTextChange,
  onToggleCollapse,
  onEnter,
  onBackspace,
  onTab,
  onShiftTab,
}: RootViewProps) {
  const rootNodes = store.getRootNodes();

  return (
    <div style={{ padding: '20px' }}>
      {rootNodes.map((node) => (
        <NodeView
          key={node.id}
          nodeId={node.id}
          store={store}
          onTextChange={onTextChange}
          onToggleCollapse={onToggleCollapse}
          onEnter={onEnter}
          onBackspace={onBackspace}
          onTab={onTab}
          onShiftTab={onShiftTab}
        />
      ))}
    </div>
  );
}
