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

import React, { useRef, useCallback, useEffect, useState } from 'react';
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
  const [isLabelFocused, setIsLabelFocused] = useState(false);
  const isNewlyCreatedRef = useRef(true);

  if (!block) {
    return <>{children}</>;
  }

  const icon = block.properties?.icon as string | undefined;
  const label = (block.properties?.label as string) || '';
  const isEmpty = label.trim() === '';

  // Auto-focus label when Field block is first created (label is empty)
  useEffect(() => {
    if (isNewlyCreatedRef.current && isEmpty && labelRef.current) {
      isNewlyCreatedRef.current = false;
      // Delay to ensure DOM is ready and avoid race conditions
      requestAnimationFrame(() => {
        labelRef.current?.focus();
        // Place caret at end
        const range = document.createRange();
        const sel = window.getSelection();
        if (labelRef.current && sel) {
          range.selectNodeContents(labelRef.current);
          range.collapse(false); // Collapse to end
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }
  }, []); // Run once on mount

  // Sync label content from store ONLY when not focused
  useEffect(() => {
    if (!isLabelFocused && labelRef.current) {
      const currentText = labelRef.current.textContent || '';
      // Always ensure zero-width space when empty (caret anchor)
      const targetContent = label || '\u200B';
      if (currentText !== targetContent) {
        // Save caret position
        const sel = window.getSelection();
        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
        const offset = range?.startOffset || 0;

        // Update content
        labelRef.current.textContent = targetContent;

        // Restore caret position (if element has focus from elsewhere)
        if (
          document.activeElement === labelRef.current &&
          sel &&
          labelRef.current.firstChild
        ) {
          const newRange = document.createRange();
          const textNode = labelRef.current.firstChild;
          const safeOffset = Math.min(
            offset,
            textNode.textContent?.length || 0
          );
          newRange.setStart(textNode, safeOffset);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }
    }
  }, [label, isLabelFocused]);

  // Focus value editor (TODO: implement in v1.1)
  const focusValue = useCallback(() => {
    // Phase 1: Deferred - user manually clicks value
    // Phase 2: Use FocusManager or pass focus callback via context
    valueRef.current?.querySelector('[contenteditable]')?.focus();
  }, []);

  // Track focus state
  const handleFocus = () => {
    setIsLabelFocused(true);
  };

  const handleBlur = () => {
    setIsLabelFocused(false);
    // Update store on blur to persist final value
    if (labelRef.current) {
      const finalLabel = labelRef.current.textContent || '';
      updateLabel(blockId, finalLabel);
    }
  };

  // Wire keyboard handling to behavior
  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    handleLabelKeyDown(e, blockId, focusValue);
  };

  // Wire input handling to behavior (update store on every keystroke)
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
          onFocus={handleFocus}
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-empty={isEmpty}
          style={{
            display: 'block',
            padding: '4px',
            minHeight: '24px',
            lineHeight: 1.5,
            color: isEmpty ? 'transparent' : colors.text.secondary,
            caretColor: colors.text.primary,
            fontWeight: 500,
            outline: 'none',
            cursor: 'text',
          }}
          onMouseDown={(e) => {
            // Allow editing but prevent block-level interactions
            e.stopPropagation();
          }}
        />
        {/* Note: Content is managed via textContent, not children, to preserve caret */}

        {/* Label placeholder - visible when empty AND not focused */}
        {isEmpty && !isLabelFocused && (
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
