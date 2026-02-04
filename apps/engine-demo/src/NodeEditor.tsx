/**
 * NodeEditor — Node-Based Editor Component
 *
 * Wires EditorState kernel to DOM.
 *
 * Rules:
 * - No mutation
 * - No logic duplication
 * - No contenteditable
 * - Kernel is single source of truth
 */

import { useState, useEffect, useRef } from 'react';
import type { Node, NodeID } from './engine/NodeKernel';
import { createNode, insertNodeAfter } from './engine/NodeKernel';
import type { EditorState } from './engine/EditorState';
import { applyIntent } from './engine/EditorState';
import { NodeView } from './NodeView';

/**
 * STEP 8.1 — UI-extended Node
 * Collapse state is UI-only, not in kernel
 */
type UINode = Node & {
  isCollapsed?: boolean;
};

export function NodeEditor() {
  // Initialize editor state
  const [editorState, setEditorState] = useState<EditorState>(() => {
    const nodes: Node[] = [
      createNode('paragraph', 'First node - try typing here'),
      createNode('paragraph', 'Second node'),
      createNode('heading', 'This is a heading'),
    ];

    return {
      nodes,
      activeNodeId: nodes[0]!.id,
      offset: nodes[0]!.text.length, // Start at end of first node
    };
  });

  // Selection state (UI-only, not in kernel)
  const [selection, setSelection] = useState<{
    anchor: { nodeId: NodeID; offset: number } | null;
    focus: { nodeId: NodeID; offset: number } | null;
  }>({ anchor: null, focus: null });

  // STEP 9.1 — Focus/Zoom state (UI-only)
  // null = normal mode (top-level view)
  // nodeId = zoomed into that node
  const [focusRootId, setFocusRootId] = useState<NodeID | null>(null);

  // Keep focus
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  /**
   * STEP 9.2 — Get Visible Nodes (respects collapse + focus)
   * Returns nodes that should be visible
   * - Respects collapse state
   * - Respects focus/zoom (if focusRootId is set)
   */
  function getVisibleNodes(nodes: UINode[]): UINode[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // STEP 9.2 — Check if node is descendant of focusRoot
    function isDescendantOf(node: UINode, ancestorId: NodeID): boolean {
      let current = node.parentId;
      while (current) {
        if (current === ancestorId) return true;
        const parent = byId.get(current);
        if (!parent) return false;
        current = parent.parentId;
      }
      return false;
    }

    function isVisible(node: UINode): boolean {
      // STEP 9.2 — If focused on a subtree, only show focusRoot and its descendants
      if (focusRootId) {
        const isFocusRoot = node.id === focusRootId;
        const isDescendant = isDescendantOf(node, focusRootId);
        if (!isFocusRoot && !isDescendant) return false;
      }

      // Check collapse state (original logic)
      let current = node.parentId;
      while (current) {
        const parent = byId.get(current);
        if (!parent) return true;
        if (parent.isCollapsed) return false;
        current = parent.parentId;
      }
      return true;
    }

    return nodes.filter(isVisible);
  }

  /**
   * STEP 7.5 — Children detection
   * Check if a node has any children
   */
  function hasChildren(node: UINode, nodes: UINode[]): boolean {
    return nodes.some((n) => n.parentId === node.id);
  }

  /**
   * STEP 4.1 — Normalize Selection
   * Converts anchor/focus into deterministic start/end
   */
  function normalizeSelection(
    anchor: { nodeId: NodeID; offset: number } | null,
    focus: { nodeId: NodeID; offset: number } | null,
    nodes: Node[]
  ): {
    start: { nodeId: NodeID; offset: number };
    end: { nodeId: NodeID; offset: number };
    sameNode: boolean;
  } | null {
    if (!anchor || !focus) return null;

    if (anchor.nodeId === focus.nodeId) {
      return {
        start: anchor.offset <= focus.offset ? anchor : focus,
        end: anchor.offset <= focus.offset ? focus : anchor,
        sameNode: true,
      };
    }

    const aIndex = nodes.findIndex((n) => n.id === anchor.nodeId);
    const fIndex = nodes.findIndex((n) => n.id === focus.nodeId);

    if (aIndex < fIndex) {
      return { start: anchor, end: focus, sameNode: false };
    } else {
      return { start: focus, end: anchor, sameNode: false };
    }
  }

  /**
   * STEP 6.4 — Indent Node (Tab)
   * Makes previous visible node the parent
   */
  function indentNode(state: EditorState): EditorState {
    const { nodes, activeNodeId } = state;
    const visibleNodes = getVisibleNodes(nodes);
    const index = visibleNodes.findIndex((n) => n.id === activeNodeId);

    if (index <= 0) return state; // Cannot indent first node

    const newParent = visibleNodes[index - 1];
    if (!newParent) return state;

    return {
      ...state,
      nodes: nodes.map((n) =>
        n.id === activeNodeId ? { ...n, parentId: newParent.id } : n
      ),
    };
  }

  /**
   * STEP 6.4 — Outdent Node (Shift+Tab)
   * Moves to parent's parent
   */
  function outdentNode(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId);
    if (!node || !node.parentId) return state; // No parent to outdent from

    const parent = state.nodes.find((n) => n.id === node.parentId);

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, parentId: parent?.parentId ?? null } : n
      ),
    };
  }

  /**
   * STEP 7.2 — Create Child (Enter at start)
   * Creates a new child node under the current node
   */
  function createChild(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId);
    if (!node) return state;

    const child = createNode(node.type, '', node.id);
    const withChild = insertNodeAfter(state.nodes, node.id, child);

    return {
      nodes: withChild,
      activeNodeId: child.id,
      offset: 0,
    };
  }

  /**
   * STEP 8.3 — Collapse Node
   * Hides all descendants
   */
  function collapseNode(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId) as UINode;
    if (!node || !hasChildren(node, state.nodes)) return state;

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, isCollapsed: true } : n
      ),
    };
  }

  /**
   * STEP 8.3 — Expand Node
   * Shows immediate children
   */
  function expandNode(state: EditorState): EditorState {
    const node = state.nodes.find((n) => n.id === state.activeNodeId) as UINode;
    if (!node || !node.isCollapsed) return state;

    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.id === node.id ? { ...n, isCollapsed: false } : n
      ),
    };
  }

  /**
   * STEP 10.3 — Property editing state
   */
  const [editingProperty, setEditingProperty] = useState<{
    nodeId: NodeID;
    key: string;
    value: string;
  } | null>(null);

  /**
   * STEP 10.3 — Add/update property on a node
   */
  function setNodeProperty(nodeId: NodeID, key: string, value: string) {
    setEditorState({
      ...editorState,
      nodes: editorState.nodes.map((n) =>
        n.id === nodeId ? { ...n, props: { ...n.props, [key]: value } } : n
      ),
    });
  }

  /**
   * STEP 9.5 — Get breadcrumb path from root to focusRootId
   */
  function getBreadcrumbs(): UINode[] {
    if (!focusRootId) return [];

    const path: UINode[] = [];
    const byId = new Map(editorState.nodes.map((n) => [n.id, n]));

    let current = byId.get(focusRootId);
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = byId.get(current.parentId);
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * STEP 9.3 — Zoom In (focus on current node)
   * Treats current node as temporary root
   */
  function zoomIn() {
    setFocusRootId(editorState.activeNodeId);
    setSelection({ anchor: null, focus: null });
    setEditorState({
      ...editorState,
      offset: 0,
    });
  }

  /**
   * STEP 9.4 — Zoom Out (return to parent view)
   * If at root, does nothing
   */
  function zoomOut() {
    if (!focusRootId) return; // Already at root

    const focusNode = editorState.nodes.find((n) => n.id === focusRootId);
    if (!focusNode) return;

    const parentId = focusNode.parentId;
    setFocusRootId(parentId);
    setSelection({ anchor: null, focus: null });

    // Move cursor to the node we just zoomed out from
    if (parentId) {
      setEditorState({
        ...editorState,
        activeNodeId: focusRootId,
        offset: 0,
      });
    }
  }

  /**
   * STEP 8.4 — Navigate through visible nodes only
   */
  function navigateVisibleUp(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.activeNodeId);

    if (index <= 0) return state; // Already at top

    const prevNode = visibleNodes[index - 1];
    if (!prevNode) return state;

    return {
      ...state,
      activeNodeId: prevNode.id,
      offset: Math.min(state.offset, prevNode.text.length),
    };
  }

  function navigateVisibleDown(state: EditorState): EditorState {
    const visibleNodes = getVisibleNodes(state.nodes);
    const index = visibleNodes.findIndex((n) => n.id === state.activeNodeId);

    if (index === -1 || index >= visibleNodes.length - 1) return state; // Already at bottom

    const nextNode = visibleNodes[index + 1];
    if (!nextNode) return state;

    return {
      ...state,
      activeNodeId: nextNode.id,
      offset: Math.min(state.offset, nextNode.text.length),
    };
  }

  /**
   * STEP 4.2 — Delete Selection
   * Removes selected text/nodes and returns new state
   */
  function deleteSelection(
    state: EditorState,
    selection: {
      start: { nodeId: NodeID; offset: number };
      end: { nodeId: NodeID; offset: number };
      sameNode: boolean;
    }
  ): EditorState {
    const { nodes } = state;
    const { start, end, sameNode } = selection;

    if (sameNode) {
      const node = nodes.find((n) => n.id === start.nodeId);
      if (!node) return state;

      const newText =
        node.text.slice(0, start.offset) + node.text.slice(end.offset);

      return {
        ...state,
        nodes: nodes.map((n) =>
          n.id === node.id ? { ...n, text: newText } : n
        ),
        activeNodeId: node.id,
        offset: start.offset,
      };
    }

    // multi-node selection
    const startIndex = nodes.findIndex((n) => n.id === start.nodeId);
    const endIndex = nodes.findIndex((n) => n.id === end.nodeId);

    const startNode = nodes[startIndex];
    const endNode = nodes[endIndex];

    if (!startNode || !endNode) return state;

    const mergedText =
      startNode.text.slice(0, start.offset) + endNode.text.slice(end.offset);

    let newNodes = nodes.slice(0, startIndex + 1);
    newNodes[startIndex] = { ...startNode, text: mergedText };
    newNodes = newNodes.concat(nodes.slice(endIndex + 1));

    return {
      nodes: newNodes,
      activeNodeId: startNode.id,
      offset: start.offset,
    };
  }

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // STEP 9.3 — Zoom In (Cmd/Ctrl + Enter)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      zoomIn();
      return;
    }

    // STEP 9.4 — Zoom Out (Escape)
    if (e.key === 'Escape') {
      e.preventDefault();
      zoomOut();
      return;
    }

    // STEP 6.4 — Handle Tab/Shift+Tab for indent/outdent
    if (e.key === 'Tab') {
      e.preventDefault();

      if (e.shiftKey) {
        // Outdent
        const newState = outdentNode(editorState);
        setEditorState(newState);
        setSelection({ anchor: null, focus: null }); // STEP 6.5 — Clear selection
      } else {
        // Indent
        const newState = indentNode(editorState);
        setEditorState(newState);
        setSelection({ anchor: null, focus: null }); // STEP 6.5 — Clear selection
      }
      return;
    }

    // Handle ArrowLeft (UI-only, no intent)
    if (e.key === 'ArrowLeft') {
      e.preventDefault();

      // STEP 8.3 — Collapse at offset 0 (if has children and not selecting)
      if (editorState.offset === 0 && !e.shiftKey) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        ) as UINode;
        if (
          activeNode &&
          hasChildren(activeNode, editorState.nodes) &&
          !activeNode.isCollapsed
        ) {
          const newState = collapseNode(editorState);
          setEditorState(newState);
          setSelection({ anchor: null, focus: null });
          return;
        }
      }

      // If shift is pressed, we're selecting
      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus left
        if (editorState.offset > 0) {
          const newState = { ...editorState, offset: editorState.offset - 1 };
          setEditorState(newState);
          setSelection((sel) => ({
            ...sel,
            focus: { nodeId: newState.activeNodeId, offset: newState.offset },
          }));
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index > 0) {
            const prevNode = editorState.nodes[index - 1];
            if (prevNode) {
              const newState = {
                ...editorState,
                activeNodeId: prevNode.id,
                offset: prevNode.text.length,
              };
              setEditorState(newState);
              setSelection((sel) => ({
                ...sel,
                focus: {
                  nodeId: newState.activeNodeId,
                  offset: newState.offset,
                },
              }));
            }
          }
        }
      } else {
        // Clear selection and move cursor
        setSelection({ anchor: null, focus: null });

        if (editorState.offset > 0) {
          setEditorState({ ...editorState, offset: editorState.offset - 1 });
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index > 0) {
            const prevNode = editorState.nodes[index - 1];
            if (prevNode) {
              setEditorState({
                ...editorState,
                activeNodeId: prevNode.id,
                offset: prevNode.text.length,
              });
            }
          }
        }
      }
      return;
    }

    // Handle ArrowRight (UI-only, no intent)
    if (e.key === 'ArrowRight') {
      e.preventDefault();

      const activeNode = editorState.nodes.find(
        (n) => n.id === editorState.activeNodeId
      ) as UINode;
      if (!activeNode) return;

      // STEP 8.3 — Expand at offset 0 (if collapsed and not selecting)
      if (editorState.offset === 0 && !e.shiftKey) {
        if (activeNode.isCollapsed) {
          const newState = expandNode(editorState);
          setEditorState(newState);
          setSelection({ anchor: null, focus: null });
          return;
        }
      }

      // If shift is pressed, we're selecting
      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus right
        if (editorState.offset < activeNode.text.length) {
          const newState = { ...editorState, offset: editorState.offset + 1 };
          setEditorState(newState);
          setSelection((sel) => ({
            ...sel,
            focus: { nodeId: newState.activeNodeId, offset: newState.offset },
          }));
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index < editorState.nodes.length - 1) {
            const nextNode = editorState.nodes[index + 1];
            if (nextNode) {
              const newState = {
                ...editorState,
                activeNodeId: nextNode.id,
                offset: 0,
              };
              setEditorState(newState);
              setSelection((sel) => ({
                ...sel,
                focus: {
                  nodeId: newState.activeNodeId,
                  offset: newState.offset,
                },
              }));
            }
          }
        }
      } else {
        // Clear selection and move cursor
        setSelection({ anchor: null, focus: null });

        if (editorState.offset < activeNode.text.length) {
          setEditorState({ ...editorState, offset: editorState.offset + 1 });
        } else {
          const index = editorState.nodes.findIndex(
            (n) => n.id === editorState.activeNodeId
          );
          if (index < editorState.nodes.length - 1) {
            const nextNode = editorState.nodes[index + 1];
            if (nextNode) {
              setEditorState({
                ...editorState,
                activeNodeId: nextNode.id,
                offset: 0,
              });
            }
          }
        }
      }
      return;
    }

    // Handle ArrowUp/ArrowDown with shift for selection (STEP 8.4 — visibility-aware)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();

      if (e.shiftKey) {
        // Initialize anchor if no selection exists
        if (!selection.anchor) {
          setSelection({
            anchor: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
            focus: {
              nodeId: editorState.activeNodeId,
              offset: editorState.offset,
            },
          });
        }

        // Move focus through visible nodes only
        const newState =
          e.key === 'ArrowUp'
            ? navigateVisibleUp(editorState)
            : navigateVisibleDown(editorState);
        setEditorState(newState);
        setSelection((sel) => ({
          ...sel,
          focus: { nodeId: newState.activeNodeId, offset: newState.offset },
        }));
      } else {
        // Clear selection and move cursor through visible nodes only
        setSelection({ anchor: null, focus: null });
        const newState =
          e.key === 'ArrowUp'
            ? navigateVisibleUp(editorState)
            : navigateVisibleDown(editorState);
        setEditorState(newState);
      }
      return;
    }

    // Check if selection exists
    const selectionExists =
      selection.anchor &&
      selection.focus &&
      !(
        selection.anchor.nodeId === selection.focus.nodeId &&
        selection.anchor.offset === selection.focus.offset
      );

    // STEP 4.3 / 10.3 — Typing With Selection / Property Trigger
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          let nextState = deleteSelection(editorState, normalized);
          setSelection({ anchor: null, focus: null });
          nextState = applyIntent(nextState, {
            type: 'insertText',
            text: e.key,
          });
          setEditorState(nextState);
          return;
        }
      }

      // STEP 10.3 — Property trigger: `:` at start of empty node
      if (e.key === ':' && editorState.offset === 0) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        );
        if (activeNode && activeNode.text === '') {
          setEditingProperty({ nodeId: activeNode.id, key: '', value: '' });
          return;
        }
      }

      // No selection - normal insert
      const newState = applyIntent(editorState, {
        type: 'insertText',
        text: e.key,
      });
      setEditorState(newState);
      return;
    }

    // STEP 4.4 / 7.4 — Backspace With Selection / Hierarchy-aware Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          const nextState = deleteSelection(editorState, normalized);
          setSelection({ anchor: null, focus: null });
          setEditorState(nextState);
          return;
        }
      }

      // STEP 7.4 — Hierarchy-aware Backspace at start of node
      if (editorState.offset === 0) {
        const activeNode = editorState.nodes.find(
          (n) => n.id === editorState.activeNodeId
        );
        if (!activeNode) return;

        // Case B: Has children - no-op (can't delete parent by accident)
        if (hasChildren(activeNode, editorState.nodes)) {
          return; // Do nothing
        }

        // Case C: Has parent - outdent
        if (activeNode.parentId) {
          const newState = outdentNode(editorState);
          setEditorState(newState);
          return;
        }

        // Case D: No parent, no children - fall through to merge with previous
      }

      // No selection, not at start OR Case D - normal backspace (delete char or merge)
      const newState = applyIntent(editorState, { type: 'backspace' });
      setEditorState(newState);
      return;
    }

    // STEP 4.5 / 7.2 — Enter With Selection / Hierarchy-aware Enter
    if (e.key === 'Enter') {
      e.preventDefault();

      if (selectionExists) {
        const normalized = normalizeSelection(
          selection.anchor,
          selection.focus,
          editorState.nodes
        );
        if (normalized) {
          let nextState = deleteSelection(editorState, normalized);
          setSelection({ anchor: null, focus: null });
          nextState = applyIntent(nextState, { type: 'enter' });
          setEditorState(nextState);
          return;
        }
      }

      // STEP 7.2 — Enter at start = create child
      if (editorState.offset === 0) {
        const newState = createChild(editorState);
        setEditorState(newState);
        return;
      }

      // No selection, not at start - normal enter (split/sibling)
      const newState = applyIntent(editorState, { type: 'enter' });
      setEditorState(newState);
      return;
    }
  };

  return (
    <div
      style={{
        padding: '40px',
        fontFamily: 'monospace',
        backgroundColor: '#1e1e1e',
        minHeight: '100vh',
        color: '#d4d4d4',
      }}
    >
      <h1 style={{ fontSize: '16px', marginBottom: '20px', color: '#888' }}>
        Engine Demo — Node-Based Editor
      </h1>

      {/* STEP 9.5 — Breadcrumb navigation */}
      {focusRootId && (
        <div
          style={{
            marginBottom: '16px',
            padding: '8px 12px',
            backgroundColor: '#252526',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setFocusRootId(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#4fc3f7',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            Root
          </button>
          {getBreadcrumbs().map((node, index) => (
            <span
              key={node.id}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span style={{ color: '#666' }}>/</span>
              <button
                onClick={() => setFocusRootId(node.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color:
                    index === getBreadcrumbs().length - 1
                      ? '#d4d4d4'
                      : '#4fc3f7',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  fontWeight:
                    index === getBreadcrumbs().length - 1 ? 'bold' : 'normal',
                }}
              >
                {node.text || '(empty)'}
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          outline: '2px solid #3e3e3e',
          padding: '20px',
          borderRadius: '4px',
          backgroundColor: '#252526',
          minHeight: '200px',
          position: 'relative',
        }}
      >
        {getVisibleNodes(editorState.nodes).map((node) => (
          <NodeView
            key={node.id}
            node={node}
            nodes={editorState.nodes}
            isActive={node.id === editorState.activeNodeId}
            cursorOffset={
              node.id === editorState.activeNodeId ? editorState.offset : null
            }
            selection={selection}
          />
        ))}

        {/* STEP 10.3/10.4 — Property Editor */}
        {editingProperty && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#1e1e1e',
              border: '2px solid #4fc3f7',
              borderRadius: '4px',
              padding: '16px',
              minWidth: '300px',
              zIndex: 1000,
            }}
          >
            <div
              style={{ marginBottom: '12px', color: '#888', fontSize: '12px' }}
            >
              Add Property
            </div>
            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="key"
                value={editingProperty.key}
                onChange={(e) =>
                  setEditingProperty({
                    ...editingProperty,
                    key: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editingProperty.key && editingProperty.value) {
                      setNodeProperty(
                        editingProperty.nodeId,
                        editingProperty.key,
                        editingProperty.value
                      );
                      setEditingProperty(null);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingProperty(null);
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#252526',
                  border: '1px solid #3e3e3e',
                  borderRadius: '2px',
                  color: '#d4d4d4',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="value"
                value={editingProperty.value}
                onChange={(e) =>
                  setEditingProperty({
                    ...editingProperty,
                    value: e.target.value,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (editingProperty.key && editingProperty.value) {
                      setNodeProperty(
                        editingProperty.nodeId,
                        editingProperty.key,
                        editingProperty.value
                      );
                      setEditingProperty(null);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingProperty(null);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#252526',
                  border: '1px solid #3e3e3e',
                  borderRadius: '2px',
                  color: '#d4d4d4',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              Enter to save • Esc to cancel
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
        <div>Nodes: {editorState.nodes.length}</div>
        <div>
          Active: {editorState.activeNodeId} @ offset {editorState.offset}
        </div>
        {selection.anchor && selection.focus && (
          <div style={{ color: '#4fc3f7', marginTop: '4px' }}>
            Selection: [{selection.anchor.nodeId.slice(0, 8)}:
            {selection.anchor.offset}] → [{selection.focus.nodeId.slice(0, 8)}:
            {selection.focus.offset}]
          </div>
        )}
        <div style={{ marginTop: '10px' }}>
          <strong style={{ color: '#d4d4d4' }}>Keyboard:</strong>
        </div>
        <div style={{ marginLeft: '8px', lineHeight: '1.6' }}>
          • Type — insert text (replaces selection if active)
          <br />
          • Enter at start — create child node
          <br />
          • Enter elsewhere — split/create sibling
          <br />
          • Backspace (has children) — no-op (can't delete parent)
          <br />
          • Backspace at start (has parent) — outdent
          <br />
          • Backspace elsewhere — delete char or merge
          <br />
          • ↑↓ — move between visible nodes
          <br />
          • ← at start (has children) — collapse node
          <br />
          • → at start (collapsed) — expand node
          <br />
          • ←→ — move cursor (cross-node at boundaries)
          <br />
          • Shift+←→ — select text (within/across nodes)
          <br />
          • Shift+↑↓ — select across visible nodes
          <br />
          • Tab — indent node (make child of previous)
          <br />
          • Shift+Tab — outdent node (move up one level)
          <br />
          • Cmd/Ctrl+Enter — zoom in (focus on node)
          <br />
          • Esc — zoom out (return to parent view)
          <br />• : at start of empty node — add property (key:value)
        </div>
      </div>
    </div>
  );
}
