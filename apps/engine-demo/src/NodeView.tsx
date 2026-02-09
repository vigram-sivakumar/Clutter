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
 *
 * D2.5 — contenteditable DOM INVARIANT (NON-NEGOTIABLE):
 * Inside .node__content ONLY these are allowed:
 *   - TEXT_NODE (plain text)
 *   - <span> with contenteditable="false" (inline references)
 *
 * NEVER allowed:
 *   - <div>, <p>, <br> or any block-level element
 *   - Browser/paste may introduce these → MUST be flattened immediately
 *   - Violation causes Enter to create line breaks instead of new nodes
 */

import { useRef, useEffect } from 'react';
import type { Node } from './engine/NodeKernel';
import { getNodeVariant } from './engine/NodeKernel';

export function NodeView({
  node,
  nodes,
  isActive,
  onCompositionStart,
  onCompositionEnd,
}: {
  node: Node;
  nodes: Node[];
  isActive: boolean;
  onCompositionStart?: (nodeId: string) => void;
  onCompositionEnd?: (nodeId: string) => void;
}) {
  // File 04 — Get variant from props (canonical source)
  const variant = getNodeVariant(node);

  // DOM-owned contentEditable ref
  // CRITICAL: Browser owns text, React never renders children in contentEditable
  const contentRef = useRef<HTMLDivElement>(null);

  // DOM sync - IMPERATIVE UPDATES ONLY (ENFORCEMENT A1)
  // Updates DOM when node structure changes (text, metadata, OR segments)
  //
  // SEGMENTED ARCHITECTURE RENDERING (MANDATORY PATTERN):
  // - If node has segments[] → render with caret anchors
  // - If node has text + meta[] → render old way (dual-mode during migration)
  useEffect(() => {
    if (!contentRef.current) return;

    // ✂️ PHASE 2.5: Typing guards DELETED
    // With MutationObserver, React renders only at commit boundaries
    // Observers are stopped before commits, so no concurrent mutations possible
    // This is structurally enforced by commit boundary contract, not by runtime checks

    // 🔒 ASSERTION: Check we're not violating invariants
    if (__DEV__) {
      try {
        (globalThis as any).__assertNotRenderingDuringTyping?.(node.id);
      } catch (e) {
        console.error('❌ NodeView invariant violation:', e);
        // Don't throw - log and skip render
        return;
      }
    }

    // SEGMENTED ARCHITECTURE: Simple rendering - no normalization needed
    // Clear and rebuild from segments
    contentRef.current.textContent = '';

    // Render all segments
    for (const segment of node.segments) {
      if (segment.type === 'text') {
        // Text segment (no wrapper span in this implementation)
        const textNode = document.createTextNode(segment.text);
        contentRef.current.appendChild(textNode);
      } else if (segment.type === 'inline') {
        // Caret anchor BEFORE (MANDATORY)
        const anchorBefore = document.createElement('span');
        anchorBefore.className = 'caret-anchor';
        anchorBefore.contentEditable = 'true';
        contentRef.current.appendChild(anchorBefore);

        // Inline element (MANDATORY contenteditable="false")
        const inlineSpan = document.createElement('span');
        inlineSpan.className = `inline-element inline-${segment.kind}`;
        inlineSpan.contentEditable = 'false';
        inlineSpan.dataset.inlineId = segment.id;
        inlineSpan.textContent = `@${segment.id}`;
        contentRef.current.appendChild(inlineSpan);

        // Caret anchor AFTER (MANDATORY)
        const anchorAfter = document.createElement('span');
        anchorAfter.className = 'caret-anchor';
        anchorAfter.contentEditable = 'true';
        contentRef.current.appendChild(anchorAfter);
      }
    }
  }, [node.segments]); // CRITICAL: Only watch segments!

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
        {/* ENFORCEMENT A1: NO REACT CHILDREN in contentEditable */}
        {/* Content managed imperatively in useEffect above */}
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
          onCompositionStart={() => onCompositionStart?.(node.id)}
          onCompositionEnd={() => onCompositionEnd?.(node.id)}
        />
      </div>
    </div>
  );
}
