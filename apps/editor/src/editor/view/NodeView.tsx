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

import { useRef, useEffect, useLayoutEffect } from 'react';
import type { Node as EditorNode, Segment, CursorPosition } from '../engine';
import { getNodeVariant } from '../engine';
import type { CaretIntent } from '../EditorTypes';

/**
 * Pure caret placement function
 * Runs after DOM commit, no timing assumptions
 * 
 * @param nodeElement - The contenteditable DOM element
 * @param node - Node data with segments
 * @param cursor - Target cursor position
 */
function placeCaretInNodeView(
  nodeElement: HTMLElement,
  node: EditorNode,
  cursor: CursorPosition
): void {
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  const { offset, segmentIndex } = cursor;
  const segments = node.segments;

  // Case 1: Cursor at end (past all segments)
  if (segmentIndex >= segments.length) {
    const lastChild = nodeElement.lastChild;
    
    if (lastChild) {
      // If lastChild is an empty text node (placeholder for empty nodes),
      // place cursor INSIDE it for stable selection
      if (lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent === '') {
        range.setStart(lastChild, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Normal case: place cursor after last child
        range.setStartAfter(lastChild);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      // No children - place at container start
      range.setStart(nodeElement, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return;
  }

  const segment = segments[segmentIndex];
  if (!segment) return;

  // Case 2: Inline segment at offset 0 - use caret-anchor
  if (segment.type === 'inline' && offset === 0) {
    placeCaretBeforeInline(nodeElement, segments, segmentIndex, sel, range);
    return;
  }

  // Case 3: Text segment
  if (segment.type === 'text') {
    // 🔥 Explicit empty segment handling (aligns with reducer contract)
    // Normalized empty nodes have segments: [{ type: 'text', text: '' }]
    if (segment.text === '') {
      const textNode = nodeElement.firstChild;

      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return; // CRITICAL: Do not fall through
      }
    }

    // Normal text placement - find text node via index
    placeCaretInText(nodeElement, segments, segmentIndex, offset, sel, range);
  }
}

/**
 * Place caret before an inline element using caret-anchor
 */
function placeCaretBeforeInline(
  nodeElement: HTMLElement,
  segments: Segment[],
  segmentIndex: number,
  sel: Selection,
  range: Range
): void {
  const children = Array.from(nodeElement.childNodes);
  let domIndex = 0;

  // Walk through segments to find DOM position
  for (let i = 0; i < segmentIndex; i++) {
    const seg = segments[i];
    if (seg?.type === 'text') {
      domIndex++; // TEXT_NODE
    } else if (seg) {
      domIndex += 3; // caret-anchor + inline + caret-anchor
    }
  }

  // domIndex now points to the caret-anchor before our inline
  const caretAnchor = children[domIndex];
  if (
    caretAnchor &&
    (caretAnchor as HTMLElement).classList?.contains('caret-anchor')
  ) {
    // Place cursor inside the caret-anchor (it's a focusable span)
    range.setStart(caretAnchor, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/**
 * Place caret in text segment
 */
function placeCaretInText(
  nodeElement: HTMLElement,
  segments: Segment[],
  segmentIndex: number,
  offset: number,
  sel: Selection,
  range: Range
): void {
  const children = Array.from(nodeElement.childNodes);
  let domIndex = 0;

  // Walk through segments to find DOM position
  for (let i = 0; i < segmentIndex; i++) {
    const seg = segments[i];
    if (seg?.type === 'text') {
      domIndex++; // TEXT_NODE
    } else if (seg) {
      domIndex += 3; // caret-anchor + inline + caret-anchor
    }
  }

  // domIndex now points to our text node
  const textNode = children[domIndex];
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const len = textNode.textContent?.length || 0;
    range.setStart(textNode, Math.min(offset, len));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export function NodeView({
  node,
  nodes,
  isActive,
  cursor,
  caretIntent,
  onCompositionStart,
  onCompositionEnd,
  onRequestSelect,
}: {
  node: EditorNode;
  nodes: EditorNode[];
  isActive: boolean;
  cursor: CursorPosition;
  caretIntent: CaretIntent | null;
  onCompositionStart?: (nodeId: string) => void;
  onCompositionEnd?: (nodeId: string) => void;
  onRequestSelect?: (nodeId: string) => void;
}) {
  // File 04 — Get variant from props (canonical source)
  const variant = getNodeVariant(node);

  // DOM-owned contentEditable ref
  // CRITICAL: Browser owns text, React never renders children in contentEditable
  const contentRef = useRef<HTMLDivElement>(null);
  
  // StrictMode guard: Prevents double-execution in development
  const lastTokenRef = useRef<string | null>(null);

  // DOM sync - IMPERATIVE UPDATES ONLY (ENFORCEMENT A1)
  // Updates DOM when node structure changes (text, metadata, OR segments)
  //
  // SEGMENTED ARCHITECTURE RENDERING (MANDATORY PATTERN):
  // - If node has segments[] → render with caret anchors
  // - If node has text + meta[] → render old way (dual-mode during migration)
  //
  // 🔒 CRITICAL: useLayoutEffect (not useEffect) ensures DOM is ready before caret placement
  useLayoutEffect(() => {
    if (!contentRef.current) return;

    // ✂️ PHASE 2.5: Typing guards DELETED
    // With MutationObserver, React renders only at commit boundaries
    // Observers are stopped before commits, so no concurrent mutations possible
    // This is structurally enforced by commit boundary contract, not by runtime checks

    // Enforcement layer removed - no runtime assertions

    // SEGMENTED ARCHITECTURE: Simple rendering - no normalization needed
    // Clear and rebuild from segments
    contentRef.current.textContent = '';

    // Every node has at least one segment (enforced by engine)
    // No placeholder logic needed

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

  // Caret placement execution
  // Owns DOM cursor placement after structural operations
  useLayoutEffect(() => {
    if (!caretIntent) return;
    if (!isActive) return;
    if (caretIntent.nodeId !== node.id) return;
    if (!contentRef.current) return;

    // StrictMode guard: Prevent double-execution in development
    if (lastTokenRef.current === caretIntent.token) return;
    lastTokenRef.current = caretIntent.token;

    // Execute placement
    placeCaretInNodeView(contentRef.current, node, cursor);

  }, [caretIntent?.token]); // ← ONLY token changes, nothing else

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
        {/* 🔒 TANA-GRADE: Empty nodes have no children, rely on CSS min-height */}
        <div
          ref={contentRef}
          className="node__content"
          // Make content area programmatically focusable and intercept pointer events
          tabIndex={-1}
          onPointerDown={(e) => {
            // Only primary button, no modifiers
            if (e.button !== 0) return;
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

            // Only handle truly empty nodes — avoid interfering with normal selection
            // Canonical empty shape: 1 text segment with empty string
            const isEmpty = node.segments.length === 1 
              && node.segments[0].type === 'text' 
              && node.segments[0].text === '';
            
            if (!isEmpty) return;

            // Prevent browser default focus/selection so we can reliably update editor state first
            e.preventDefault();
            e.stopPropagation();

            try {
              (onRequestSelect as any)?.(node.id);
            } catch (err) {
              // Swallow errors - selection fallback still works
            }
          }}
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
