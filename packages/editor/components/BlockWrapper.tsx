/**
 * BlockWrapper - Uniform container for all block elements
 * 
 * Provides consistent structure across all blocks:
 * - Same container dimensions
 * - Optional marker/icon area (left side)
 * - Content area (right side)
 * - No margins (parent handles spacing via gap)
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────┐
 * │ [Marker Container 24×24] [Gap 8px] [Content - flex: 1] │
 * │   ├─ Icon 16px centered                                 │
 * └─────────────────────────────────────────────────────────┘
 * 
 * Indent per level = 32px (24px marker + 8px gap)
 */

import React from 'react';
import { spacing, sizing, typography } from '../tokens';

interface BlockWrapperProps {
  /** Content to render in the marker area (optional) */
  marker?: React.ReactNode;
  /** Main content */
  children: React.ReactNode;
  /** Additional styles for the wrapper */
  style?: React.CSSProperties;
  /** Data attributes */
  dataType?: string;
  /** Indentation level (for nested blocks) */
  level?: number;
  /** Toggle context (for visual grouping indent) */
  parentToggleId?: string | null;
  /** Additional class name */
  className?: string;
}

/**
 * Marker container with fixed dimensions
 * 24px wide × 24px tall, content centered
 * Contains 16px marker icon
 */
export function MarkerContainer({ children }: { children?: React.ReactNode }) {
  return (
    <div
      contentEditable={false}
      style={{
        width: sizing.markerContainer,
        height: sizing.lineHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        // No marginRight - parent container uses gap for spacing
      }}
    >
      {children}
    </div>
  );
}

/**
 * Main block wrapper component
 */
export function BlockWrapper({
  marker,
  children,
  style,
  dataType,
  level = 0,
  parentToggleId,
  className,
}: BlockWrapperProps) {
  // Hierarchy indent (structural nesting)
  const hierarchyIndent = level * spacing.indent;
  
  // Toggle indent (visual grouping)
  const toggleIndent = parentToggleId ? spacing.toggleIndent : 0;
  
  // Total indent = both layers
  const indent = hierarchyIndent + toggleIndent;

  return (
    <div
      data-type={dataType}
      data-level={level}
      data-toggle={parentToggleId || undefined}
      className={className}
      onMouseDown={(e) => {
        // 🔬 FORENSIC: Track mouse interactions on blocks
        if (import.meta.env.DEV) {
          
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        paddingLeft: indent,
        fontFamily: typography.fontFamily,
        fontSize: typography.body,
        lineHeight: typography.lineHeightRatio,
        // No margin - parent uses gap for spacing
        ...style,
      }}
    >
      {marker !== undefined && <MarkerContainer>{marker}</MarkerContainer>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Styles object for common block elements
 * Use these when you can't use BlockWrapper (e.g., renderHTML)
 */
export const blockStyles = {
  /** Base container styles */
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    fontFamily: typography.fontFamily,
    fontSize: `${typography.body}px`,
    lineHeight: typography.lineHeightRatio,
  },
  /** Marker container styles */
  marker: {
    width: `${sizing.markerContainer}px`,
    height: `${sizing.lineHeight}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // No marginRight - parent container uses gap for spacing
  },
  /** Content area styles */
  content: {
    flex: 1,
    minWidth: 0,
  },
} as const;

/**
 * Get inline style string for renderHTML
 */
export function getBlockContainerStyle(
  level: number = 0,
  parentToggleId?: string | null
): string {
  const hierarchyIndent = level * spacing.indent;
  const toggleIndent = parentToggleId ? spacing.toggleIndent : 0;
  const indent = hierarchyIndent + toggleIndent;
  
  return `
    display: flex;
    align-items: flex-start;
    padding-left: ${indent}px;
    font-family: ${typography.fontFamily};
    font-size: ${typography.body}px;
    line-height: ${typography.lineHeightRatio};
  `.replace(/\s+/g, ' ').trim();
}

export function getMarkerStyle(): string {
  return `
    width: ${sizing.markerContainer}px;
    height: ${sizing.lineHeight}px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  `.replace(/\s+/g, ' ').trim();
}

export function getContentStyle(): string {
  return `flex: 1; min-width: 0;`;
}

