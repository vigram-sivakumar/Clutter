/**
 * NodeView — Renders a single node with visual caret and selection
 * File 05 — Canonical node anatomy (LOCKED)
 *
 * DOM structure (immutable):
 * <div class="node node--{variant}">
 *   <div class="node__indent"></div>
 *   <div class="node__row">
 *     <div class="node__marker"></div>
 *     <div class="node__content" contenteditable></div>
 *   </div>
 * </div>
 */

import type { Node, NodeID } from './engine/NodeKernel';
import { getNodeVariant } from './engine/NodeKernel';

export function NodeView({
  node,
  nodes,
  isActive,
  cursorOffset,
  selection,
}: {
  node: Node;
  nodes: Node[];
  isActive: boolean;
  cursorOffset: number | null;
  selection: {
    anchor: { nodeId: NodeID; offset: number } | null;
    focus: { nodeId: NodeID; offset: number } | null;
  };
}) {
  // File 04 — Get variant from props (canonical source)
  const variant = getNodeVariant(node);

  // Calculate depth for indentation
  function getDepth(node: Node, nodes: Node[]): number {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    let depth = 0;
    let current = node;

    while (current.parentId) {
      const parent = nodesById.get(current.parentId);
      if (!parent) break;
      depth++;
      current = parent;
    }

    return depth;
  }

  const depth = getDepth(node, nodes);

  // Calculate selection range for this node
  const getSelectionRange = (): { start: number; end: number } | null => {
    if (!selection.anchor || !selection.focus) return null;

    // Find node indices
    const nodeIndex = nodes.findIndex((n) => n.id === node.id);
    const anchorIndex = nodes.findIndex(
      (n) => n.id === selection.anchor!.nodeId
    );
    const focusIndex = nodes.findIndex((n) => n.id === selection.focus!.nodeId);

    // Normalize selection direction (start <= end)
    const isForward =
      anchorIndex < focusIndex ||
      (anchorIndex === focusIndex &&
        selection.anchor!.offset <= selection.focus!.offset);

    const startNodeIndex = isForward ? anchorIndex : focusIndex;
    const endNodeIndex = isForward ? focusIndex : anchorIndex;
    const startOffset = isForward
      ? selection.anchor!.offset
      : selection.focus!.offset;
    const endOffset = isForward
      ? selection.focus!.offset
      : selection.anchor!.offset;

    // Check if this node is in selection range
    if (nodeIndex < startNodeIndex || nodeIndex > endNodeIndex) return null;

    // Calculate character range
    if (nodeIndex === startNodeIndex && nodeIndex === endNodeIndex) {
      // Selection within same node
      if (startOffset === endOffset) return null; // Collapsed selection
      return { start: startOffset, end: endOffset };
    } else if (nodeIndex === startNodeIndex) {
      // First node in selection
      return { start: startOffset, end: node.text.length };
    } else if (nodeIndex === endNodeIndex) {
      // Last node in selection
      return { start: 0, end: endOffset };
    } else {
      // Middle node - fully selected
      return { start: 0, end: node.text.length };
    }
  };

  // Render text with caret and/or selection
  const renderText = () => {
    const text = node.text || '';
    const selRange = getSelectionRange();

    // No selection, show caret if active
    if (!selRange) {
      if (!isActive || cursorOffset === null) {
        return <span>{text || '\u00A0'}</span>;
      }

      const before = text.substring(0, cursorOffset);
      const after = text.substring(cursorOffset);

      return (
        <span>
          {before}
          <span
            style={{
              display: 'inline-block',
              width: '2px',
              height: '1em',
              backgroundColor: '#d4d4d4',
              animation: 'blink 1s step-end infinite',
            }}
          />
          {after || '\u00A0'}
        </span>
      );
    }

    // Render with selection highlight
    const beforeSel = text.substring(0, selRange.start);
    const selected = text.substring(selRange.start, selRange.end);
    const afterSel = text.substring(selRange.end);

    return (
      <span>
        {beforeSel}
        <span style={{ backgroundColor: '#264f78' }}>
          {selected || '\u00A0'}
        </span>
        {afterSel}
      </span>
    );
  };

  // Calculate auto-index for numbered nodes (File 04)
  const getNumberedIndex = (): number => {
    const parentId = node.parentId;
    const siblings = nodes.filter(
      (n) => n.parentId === parentId && getNodeVariant(n) === 'numbered'
    );
    const currentIndex = siblings.findIndex((n) => n.id === node.id);
    return currentIndex + 1;
  };

  // Render marker based on variant (File 04)
  const renderMarker = () => {
    switch (variant) {
      case 'bullet':
        return '•';
      case 'task':
        // TODO: Task completion state will use node.props.completed
        return '☐';
      case 'numbered':
        return `${getNumberedIndex()}.`;
      case 'heading-1':
        return 'H1';
      case 'heading-2':
        return 'H2';
      case 'callout':
        return '▎';
      case 'paragraph':
      default:
        return null;
    }
  };

  // File 05 — Canonical node anatomy
  return (
    <div
      className={`node node--${variant}`}
      style={{
        backgroundColor: isActive ? '#2d2d30' : 'transparent',
        borderRadius: '2px',
        color: '#d4d4d4',
      }}
    >
      {/* File 05 — node__indent (depth visualization) */}
      <div className="node__indent" style={{ width: `${depth * 20}px` }} />

      {/* File 05 — node__row (horizontal container) */}
      <div className="node__row">
        {/* File 05 — node__marker (visual affordance only) */}
        <div
          className="node__marker"
          style={{
            color: '#888',
            fontSize: '14px',
          }}
        >
          {renderMarker()}
        </div>

        {/* File 05 — node__content (single editable surface) */}
        <div
          className="node__content"
          style={{
            fontSize: variant.startsWith('heading') ? '18px' : '14px',
            fontWeight: variant.startsWith('heading') ? 'bold' : 'normal',
          }}
        >
          {renderText()}
        </div>
      </div>
    </div>
  );
}
