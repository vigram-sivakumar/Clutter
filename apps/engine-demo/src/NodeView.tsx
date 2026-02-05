/**
 * NodeView — Renders a single node with visual caret and selection
 */

import type { Node, NodeID } from './engine/NodeKernel';
import { getNodeLabel } from './NodeEditor';

export function NodeView({
  node,
  nodes,
  backlinks,
  isActive,
  cursorOffset,
  selection,
  onPropertyClick,
  onPropertyDelete,
  onRefClick,
  onAddRefClick,
}: {
  node: Node;
  nodes: Node[];
  backlinks: Node[];
  isActive: boolean;
  cursorOffset: number | null;
  selection: {
    anchor: { nodeId: NodeID; offset: number } | null;
    focus: { nodeId: NodeID; offset: number } | null;
  };
  onPropertyClick?: (key: string, value: string) => void;
  onPropertyDelete?: (key: string) => void;
  onRefClick?: (targetId: NodeID) => void;
  onAddRefClick?: (nodeId: NodeID) => void;
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

        {/* STEP 10.2/10.5.5 — Render properties (clickable) */}
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
              <div
                key={key}
                style={{
                  marginLeft: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  onClick={() => onPropertyClick?.(key, value)}
                  style={{
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '2px',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#2d2d30')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span style={{ color: '#4fc3f7' }}>#{key}</span>
                  <span style={{ color: '#888' }}>: </span>
                  <span style={{ color: '#b5cea8' }}>{value}</span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPropertyDelete?.(key);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '0',
                    fontSize: '10px',
                    lineHeight: '1',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = '#f44336')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* STEP 11.2.1 — Add reference button (only when active) */}
        {isActive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddRefClick?.(node.id);
            }}
            style={{
              marginTop: '4px',
              marginLeft: '16px',
              background: 'none',
              border: '1px solid #3e3e3e',
              borderRadius: '2px',
              color: '#888',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'monospace',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#d4d4d4';
              e.currentTarget.style.borderColor = '#666';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#888';
              e.currentTarget.style.borderColor = '#3e3e3e';
            }}
          >
            +ref
          </button>
        )}

        {/* STEP 11.1.4 — Render references */}
        {node.refs && node.refs.length > 0 && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '11px',
              color: '#888',
            }}
          >
            {node.refs.map((refId) => {
              const refNode = nodes.find((n) => n.id === refId);
              // STEP 12.2 — Use canonical label helper
              const refTitle = refNode ? getNodeLabel(refNode) : '(missing)';
              // PHASE 20: Add tooltip for missing refs
              const refTooltip = refNode
                ? undefined
                : 'Target node not found at import time';

              return (
                <div
                  key={refId}
                  style={{
                    marginLeft: '16px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    display: 'inline-block',
                  }}
                  title={refTooltip}
                  onClick={() => onRefClick?.(refId)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#2d2d30')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span style={{ color: '#666' }}>↳ </span>
                  <span style={{ color: '#9cdcfe' }}>@{refTitle}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* STEP 11.3.4 — Render backlinks (derived, read-only) */}
        {backlinks.length > 0 && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: '#888',
            }}
          >
            <div
              style={{
                marginLeft: '16px',
                marginBottom: '4px',
                color: '#666',
                fontStyle: 'italic',
              }}
            >
              Referenced by:
            </div>
            {backlinks.map((backlinkNode) => {
              // PHASE 20: Add tooltip for deleted nodes
              const isDeleted =
                'isDeleted' in backlinkNode && backlinkNode.isDeleted;
              const backlinkTooltip = isDeleted
                ? 'Node was deleted but preserved for integrity'
                : undefined;

              return (
                <div
                  key={backlinkNode.id}
                  style={{
                    marginLeft: '16px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    display: 'inline-block',
                  }}
                  title={backlinkTooltip}
                  onClick={() => onRefClick?.(backlinkNode.id)}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = '#2d2d30')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span style={{ color: '#666' }}>← </span>
                  {/* STEP 12.2 — Use canonical label helper */}
                  <span style={{ color: '#ce9178' }}>
                    {getNodeLabel(backlinkNode)}
                  </span>
                </div>
              );
            })}
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
