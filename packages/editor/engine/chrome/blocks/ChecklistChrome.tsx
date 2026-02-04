/**
 * Checklist Block Chrome
 *
 * Visual structure for Checklist blocks: Checkbox + Content
 *
 * Layout:
 * [Checkbox 24px container] [Content flex-1]
 *
 * Responsibilities:
 * - Render checkbox and content layout
 * - Wire checkbox events to behavior functions
 * - Apply conditional styling (strike-through when checked)
 *
 * Does NOT:
 * - Mutate block store directly (calls behavior functions)
 * - Contain business logic (delegates to behavior)
 */

import React from 'react';
import { Checkbox } from '@clutter/ui';
import { useBlockStore } from '../../store/blockStore';
import { useEditorTheme } from '../../../theme/EditorThemeContext';
import { toggleChecked } from '../../blocks/behaviors/checklist';

interface ChecklistChromeProps {
  blockId: string;
  children: React.ReactNode; // Lexical editor
}

export function ChecklistChrome({ blockId, children }: ChecklistChromeProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  if (!block) {
    return <>{children}</>;
  }

  const checked = block.properties?.checked === true;

  const handleCheckboxChange = () => {
    toggleChecked(blockId);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      {/* Checkbox container - 24px wide for alignment */}
      <div
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Checkbox
          checked={checked}
          onChange={handleCheckboxChange}
          size={16}
          onClick={(e) => {
            // Prevent focus steal from editor
            e.preventDefault();
          }}
        />
      </div>

      {/* Content with conditional styling */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          textDecoration: checked ? 'line-through' : 'none',
          color: checked ? colors.text.tertiary : 'inherit',
        }}
      >
        {children}
      </div>
    </div>
  );
}
