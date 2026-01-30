/**
 * BlockSelectionHalo - Visual selection indicator
 *
 * Shows blue glow around selected blocks.
 * Positioned absolutely to avoid affecting layout.
 *
 * CRITICAL CONTRACT:
 * The `indent` prop MUST equal the paddingLeft/marginLeft applied to the block wrapper.
 * This ensures the halo aligns with the visual block edge.
 *
 * Usage:
 * ```tsx
 * const { indent } = useBlock({ ... });
 * <BlockSelectionHalo isSelected={isSelected} indent={indent} />
 * ```
 */

import React from 'react';
import { useEditorTheme } from '../../../theme/EditorThemeContext';
import { radius } from '@clutter/ui';

interface BlockSelectionHaloProps {
  isSelected: boolean;
  indent?: number; // Indent offset to start halo from content, not container edge
}

export function BlockSelectionHalo({
  isSelected,
  indent = 0,
}: BlockSelectionHaloProps) {
  const { colors: _colors } = useEditorTheme();

  return (
    <div
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        top: -2, // Extend 2px up for breathing room
        right: -2, // Extend 2px right
        bottom: -2, // Extend 2px down
        left: indent - 2, // Extend 2px left (accounting for indent)
        background: 'rgba(35, 131, 226, 0.14)',
        borderRadius: radius['3'],
        opacity: isSelected ? 1 : 0,
        transition: 'opacity 200ms ease',
        zIndex: 81,
      }}
      data-block-selected={isSelected || undefined}
    />
  );
}
