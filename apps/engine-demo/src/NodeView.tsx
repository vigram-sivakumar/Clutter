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

import { useRef, useEffect } from 'react';
import type { Node, NodeID } from './engine/NodeKernel';
import { getNodeVariant } from './engine/NodeKernel';

export function NodeView({
  node,
  nodes,
  isActive,
}: {
  node: Node;
  nodes: Node[];
  isActive: boolean;
}) {
  // 🔍 DIAGNOSTIC: Track DOM node identity
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contentRef.current) return;

    // Assign unique runtime ID to DOM node
    if (!(contentRef.current as any).__dom_id) {
      (contentRef.current as any).__dom_id = Math.random()
        .toString(36)
        .slice(2);
    }

    console.log(
      '[DOM]',
      'nodeId=',
      node.id,
      'domId=',
      (contentRef.current as any).__dom_id
    );
  });
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
          ref={contentRef}
          className="node__content"
          contentEditable
          suppressContentEditableWarning
          data-node-id={node.id}
          spellCheck={false}
          style={{
            fontSize: variant.startsWith('heading') ? '18px' : '14px',
            fontWeight: variant.startsWith('heading') ? 'bold' : 'normal',
          }}
        >
          {node.text || '\u00A0'}
        </div>
      </div>
    </div>
  );
}
