/**
 * BlockContentColumn - Vertical content container for block content + metadata
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 CRITICAL INVARIANT - Content + Metadata Must Stack Vertically
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This primitive enforces vertical flow for document content and metadata
 * (descriptions, comments, etc.), even when the parent NodeViewWrapper uses
 * horizontal flex layout for chrome (icons, markers, handles).
 *
 * Why this exists:
 * - NodeViewWrapper may be horizontal (flex row) for chrome layout
 * - Content must always be vertical (text + descriptions stack)
 * - Mixing these axes breaks description positioning
 *
 * Architecture:
 * ```
 * NodeViewWrapper (horizontal - for chrome)
 * ├─ Icon/Marker (optional)
 * └─ BlockContentColumn (vertical - for content) ← This component
 *    ├─ NodeViewContent (text)
 *    └─ BlockDescription (metadata)
 * ```
 *
 * Usage:
 * ```tsx
 * <NodeViewWrapper style={{ display: 'flex' }}>
 *   <BlockHoverZones />
 *
 *   <BlockContentColumn>
 *     <NodeViewContent />
 *     {description && <BlockDescription mode={...} />}
 *   </BlockContentColumn>
 *
 *   <BlockSelectionHalo />
 * </NodeViewWrapper>
 * ```
 *
 * Applies to:
 * - Heading (needs icon space)
 * - CodeBlock (language badge)
 * - Callout (icon + content)
 * - Blockquote (border + content)
 * - Any block with horizontal chrome
 */

import type { ReactNode } from 'react';

export interface BlockContentColumnProps {
  children: ReactNode;
}

/**
 * BlockContentColumn - Enforces vertical stacking for content + metadata
 *
 * Provides a consistent vertical flow container that works within any
 * parent layout (flex row, flex column, or block).
 */
export function BlockContentColumn({ children }: BlockContentColumnProps) {
  return (
    <div
      style={{
        flex: 1, // Fill available space in parent
        minWidth: 0, // Allow flex shrinking (prevents overflow)
        display: 'flex', // Enable flexbox for children
        flexDirection: 'column', // Force vertical stacking
      }}
    >
      {children}
    </div>
  );
}
