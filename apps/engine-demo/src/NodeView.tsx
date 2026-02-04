/**
 * NodeView — Renders a single node with visual caret and selection
 */

import type { Node, NodeID } from './engine/NodeKernel';

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
  const fontSize = node.type === 'heading' ? '20px' : '14px';
  const fontWeight = node.type === 'heading' ? 'bold' : 'normal';

  // STEP 8 — Check if node has children and collapse state
  const hasChildren = nodes.some((n) => n.parentId === node.id);
  const isCollapsed = (node as any).isCollapsed;

  /**
   * STEP 6.3 — Calculate depth for indentation
   */
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

  return (
    <div
      style={{
        padding: '4px 8px',
        paddingLeft: `${8 + depth * 20}px`, // STEP 6.3 — Apply indentation
        marginBottom: '2px',
        backgroundColor: isActive ? '#2d2d30' : 'transparent',
        borderRadius: '2px',
        fontSize,
        fontWeight,
        minHeight: '24px',
        color: '#d4d4d4',
      }}
    >
      {/* STEP 8 — Collapse/expand indicator */}
      <span
        style={{
          marginRight: '8px',
          width: '12px',
          display: 'inline-block',
          color: '#888',
        }}
      >
        {hasChildren ? (isCollapsed ? '▶' : '▼') : '•'}
      </span>
      <span style={{ color: '#666', marginRight: '8px', fontSize: '10px' }}>
        [{node.type}]
      </span>
      <div style={{ display: 'inline-block', flex: 1 }}>
        {renderText()}

        {/* STEP 10.2 — Render properties */}
        {node.props && Object.keys(node.props).length > 0 && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#888',
              fontStyle: 'italic',
            }}
          >
            {Object.entries(node.props).map(([key, value]) => (
              <div key={key} style={{ marginLeft: '16px' }}>
                <span style={{ color: '#4fc3f7' }}>#{key}</span>
                <span style={{ color: '#888' }}>: </span>
                <span style={{ color: '#b5cea8' }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// CSS for caret blink animation
const style = document.createElement('style');
style.textContent = `
  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
`;
document.head.appendChild(style);
