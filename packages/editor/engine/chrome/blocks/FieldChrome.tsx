/**
 * Field Block Chrome
 *
 * Visual structure for Field blocks: Icon + Label + Value
 *
 * Layout:
 * [Icon 20px] [Label 120px fixed] [Value flex-1]
 *
 * Responsibilities:
 * - Render layout and structure
 * - Wire events to behavior functions
 * - Manage focus and interaction states
 *
 * Does NOT:
 * - Mutate block store directly (calls behavior functions)
 * - Contain business logic (delegates to behavior)
 */

import React, { useRef, useCallback } from 'react';
import { Sticker } from '@clutter/ui';
import { useBlockStore } from '../../store/blockStore';
import { useEditorTheme } from '../../../theme/EditorThemeContext';
import { updateLabel, handleLabelKeyDown } from '../../blocks/behaviors/field';

interface FieldChromeProps {
  blockId: string;
  children: React.ReactNode; // Value editor (Lexical)
}

export function FieldChrome({ blockId, children }: FieldChromeProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  const labelRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  if (!block) {
    return <>{children}</>;
  }

  const icon = block.properties?.icon as string | undefined;
  const label = (block.properties?.label as string) || '';
  const isEmpty = label.trim() === '';

  // Focus value editor (TODO: implement in v1.1)
  const focusValue = useCallback(() => {
    // Phase 1: Deferred - user manually clicks value
    // Phase 2: Use FocusManager or pass focus callback via context
    valueRef.current?.querySelector('[contenteditable]')?.focus();
  }, []);

  // Wire keyboard handling to behavior
  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    handleLabelKeyDown(e, blockId, focusValue);
  };

  // Wire input handling to behavior
  const handleInput = (e: React.FormEvent<HTMLSpanElement>) => {
    const newLabel = e.currentTarget.textContent || '';
    updateLabel(blockId, newLabel);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      {/* Icon - shows Sticker as default */}
      <div
        style={{
          padding: '4px 0',
          minHeight: '32px',
          lineHeight: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: colors.text.tertiary,
        }}
      >
        {icon ? icon : <Sticker size={20} />}
      </div>

      {/* Label - fixed 120px width, single-line editable text */}
      <div style={{ position: 'relative', width: '120px', flexShrink: 0 }}>
        <span
          ref={labelRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-empty={isEmpty}
          style={{
            display: 'block',
            padding: '4px',
            minHeight: '24px',
            lineHeight: 1.5,
            color: isEmpty ? 'transparent' : colors.text.secondary,
            fontWeight: 500,
            outline: 'none',
            cursor: 'text',
          }}
          onMouseDown={(e) => {
            // Allow editing but prevent block-level interactions
            e.stopPropagation();
          }}
        >
          {label || '\u200B'}
        </span>

        {/* Label placeholder - always visible when empty */}
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: '4px',
              lineHeight: 1.5,
              color: '#999',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            Label
          </div>
        )}
      </div>

      {/* Value - flex 1, rich text editor (Lexical) */}
      <div ref={valueRef} style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
