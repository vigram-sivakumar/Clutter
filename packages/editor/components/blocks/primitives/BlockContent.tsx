/**
 * BlockContent - Content area wrapper
 *
 * Provides consistent flex:1 layout for block content.
 * Accepts custom styles for special cases (strikethrough for completed tasks, etc.)
 *
 * Usage:
 * ```tsx
 * <BlockContent style={{ textDecoration: 'line-through' }}>
 *   <NodeViewContent />
 * </BlockContent>
 * ```
 */

import { ReactNode } from 'react';

interface BlockContentProps {
  children: ReactNode;
  style?: React.CSSProperties;
}

export function BlockContent({ children, style }: BlockContentProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
