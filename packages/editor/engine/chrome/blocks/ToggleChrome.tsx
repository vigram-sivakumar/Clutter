/**
 * Toggle Block Chrome
 *
 * Visual structure for Toggle blocks: Chevron + Content + Status
 *
 * Layout:
 * [Chevron 24px container] [Content flex-1]
 * [Status message] (when collapsed)
 *
 * Responsibilities:
 * - Render chevron that rotates based on collapsed state
 * - Wire chevron click to behavior functions
 * - Display child count status when collapsed
 *
 * Does NOT:
 * - Mutate block store directly (calls behavior functions)
 * - Filter/hide children (handled by LexicalDocumentEditor)
 * - Contain business logic (delegates to behavior)
 */

import React from 'react';
import { ChevronDown } from '@clutter/ui';
import { useBlockStore } from '../../store/blockStore';
import { useEditorTheme } from '../../../theme/EditorThemeContext';
import { toggleCollapsed } from '../../blocks/behaviors/toggle';

interface ToggleChromeProps {
  blockId: string;
  children: React.ReactNode; // Lexical editor
}

export function ToggleChrome({ blockId, children }: ToggleChromeProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  if (!block) {
    return <>{children}</>;
  }

  const collapsed = block.properties?.collapsed === true;

  const handleChevronClick = () => {
    toggleCollapsed(blockId);
  };

  // Count children for status message
  const allBlocks = useBlockStore.getState().getAllBlocks();
  const childCount = allBlocks.filter((b) => b.parent === blockId).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Main row: chevron + content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        {/* Chevron container - 24px wide */}
        <div
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
            color: colors.text.tertiary,
          }}
          onClick={handleChevronClick}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus steal
        >
          {/* Chevron icon - rotates when collapsed */}
          <ChevronDown
            size={16}
            style={{
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>

      {/* Status message row (below content) - only when collapsed */}
      {collapsed && childCount === 0 && (
        <div
          style={{
            marginLeft: '32px', // Align with content (24px chevron + 8px gap)
            fontSize: '11px',
            color: colors.text.tertiary,
            userSelect: 'none',
          }}
        >
          Empty toggle
        </div>
      )}
      {collapsed && childCount > 0 && (
        <div
          onClick={handleChevronClick}
          style={{
            marginLeft: '32px',
            fontSize: '12px',
            color: colors.text.tertiary,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {childCount} hidden {childCount === 1 ? 'item' : 'items'}
        </div>
      )}
    </div>
  );
}
