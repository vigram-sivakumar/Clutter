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
import type { Node } from './engine/NodeKernel';
import { getNodeVariant, getReferences } from './engine/NodeKernel';

export function NodeView({
  node,
  nodes,
  isActive,
}: {
  node: Node;
  nodes: Node[];
  isActive: boolean;
}) {
  // File 04 — Get variant from props (canonical source)
  const variant = getNodeVariant(node);

  // DOM-owned contentEditable ref
  // CRITICAL: Browser owns text after mount, React NEVER updates it
  const contentRef = useRef<HTMLDivElement>(null);

  // DOM sync (FINAL FIX for split reusing node.id)
  // Updates DOM when node.text or references change, but ONLY if DOM doesn't match
  // This handles splits (where state changes but DOM doesn't) while preserving typing
  const references = getReferences(node);

  useEffect(() => {
    if (!contentRef.current) return;

    // Extract current DOM text (ignoring reference spans)
    let currentDOMText = '';
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );
    let textNode = walker.nextNode();
    while (textNode) {
      currentDOMText += textNode.textContent || '';
      textNode = walker.nextNode();
    }

    // Count current DOM references
    const currentDOMRefs =
      contentRef.current.querySelectorAll('.node__reference').length;

    // Only update if DOM doesn't match state (structural change, not typing)
    if (
      currentDOMText === (node.text || '') &&
      currentDOMRefs === references.length
    ) {
      return; // DOM already correct, don't destroy browser's work
    }

    // Write content (state changed externally, not from typing)
    contentRef.current.textContent = '';

    // Insert plain text first
    if (node.text) {
      const textNodeEl = document.createTextNode(node.text);
      contentRef.current.appendChild(textNodeEl);
    }

    // Imperatively insert reference spans (not JSX)
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      if (!ref) continue; // Type safety

      const span = document.createElement('span');
      span.className = 'node__reference';
      span.contentEditable = 'false';
      span.dataset.refIndex = String(i);
      span.textContent = ref.targetNodeId; // Placeholder, will resolve titles later
      contentRef.current.appendChild(span);
    }

    // Ensure empty nodes can receive cursor
    if (!node.text && references.length === 0) {
      contentRef.current.textContent = '\u00A0';
    }
  }, [node.text, references.length]); // Update when text or refs change, guard prevents typing overwrites

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
        {/* Phase 09 Fix — NO JSX children, purely DOM-owned */}
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
        />
        {/* Content managed imperatively via useEffect above */}
      </div>
    </div>
  );
}
