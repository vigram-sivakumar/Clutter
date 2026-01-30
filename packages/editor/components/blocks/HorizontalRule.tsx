/**
 * HorizontalRule - React node view for horizontal rules with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Uses inline SVG for wavy pattern with theme-aware colors.
 * Supports width toggle: full width or 128px centered.
 */

import { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { patterns, sizing } from '../../tokens';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { FoldHorizontal, UnfoldHorizontal } from '@clutter/ui';
import { useBlock, BlockHoverZones, BlockSelectionHalo } from './primitives';

interface HorizontalRuleProps extends NodeViewProps {
  updateAttributes: (_attrs: Record<string, any>) => void;
}

// Height for both styles (consistent clickable area)
const HR_HEIGHT = 24;

export function HorizontalRule({
  node,
  editor,
  getPos,
  updateAttributes,
}: HorizontalRuleProps) {
  const { colors } = useEditorTheme();
  const hrStyle = node.attrs.style || 'plain';
  const fullWidth = node.attrs.fullWidth ?? true;
  const colorMode = node.attrs.color || 'default';
  const [isHovered, setIsHovered] = useState(false);

  // 🎯 INDENT RENDERING RULE:
  // indent = 0 → Full width (section separator)
  // indent >= 1 → Indented like any other block (left-aligned, not centered)
  const blockIndent = node.attrs.indent || 0;
  const isFullWidth = blockIndent === 0;

  // Toggle between default divider color and accent orange
  const dividerColor =
    colorMode === 'accent' ? colors.semantic.orange : colors.border.divider;

  const handleToggleWidth = () => {
    updateAttributes({ fullWidth: !fullWidth });
  };

  const handleToggleColor = () => {
    updateAttributes({ color: colorMode === 'default' ? 'accent' : 'default' });
  };

  // Use block primitives for all common functionality
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      height: HR_HEIGHT, // HorizontalRule-specific: fixed height
      display: 'flex',
      alignItems: 'center',
      justifyContent: isFullWidth ? 'center' : 'flex-start', // Left-align when indented
      cursor: 'pointer',
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      {...wrapperProps}
      data-style={hrStyle}
      data-full-width={fullWidth}
      className="block-handle-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* HR line container with conditional width */}
      <div
        style={{
          width:
            isFullWidth && fullWidth
              ? '100%' // Full width at root level
              : fullWidth
                ? `calc(100% - ${indent}px)` // Full remaining width when indented
                : '128px', // Fixed width when toggled off
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'width 0.2s ease',
        }}
      >
        {hrStyle === 'wavy' ? (
          // Wavy pattern using inline SVG with theme color
          <svg
            width="100%"
            height={patterns.wave.height}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <defs>
              <pattern
                id="wavePattern"
                patternUnits="userSpaceOnUse"
                width={patterns.wave.width}
                height={patterns.wave.height}
              >
                <path
                  d={patterns.wave.path}
                  stroke={dividerColor}
                  strokeWidth={patterns.wave.strokeWidth}
                  strokeLinecap="round"
                  fill="none"
                />
              </pattern>
            </defs>
            <rect
              width="100%"
              height={patterns.wave.height}
              fill="url(#wavePattern)"
            />
          </svg>
        ) : (
          // Plain line
          <div
            style={{
              width: '100%',
              height: 1,
              backgroundColor: dividerColor,
            }}
          />
        )}
      </div>

      {/* Toggle controls - shown on hover */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: isHovered ? 1 : 0,
          pointerEvents: isHovered ? 'auto' : 'none',
          transition: 'opacity 150ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        {/* Button group wrapper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: colors.background.default,
            borderRadius: sizing.radius.sm,
            padding: '0 4px',
            overflow: 'hidden',
          }}
        >
          {/* Width toggle button */}
          <div
            onClick={handleToggleWidth}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              cursor: 'pointer',
              color: colors.text.secondary,
              transition: 'background-color 0.15s ease',
              borderRadius: sizing.radius.sm,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.background.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {fullWidth ? (
              <FoldHorizontal size={14} />
            ) : (
              <UnfoldHorizontal size={14} />
            )}
          </div>

          {/* Color toggle button */}
          <div
            onClick={handleToggleColor}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              borderRadius: sizing.radius.sm,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.background.hover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: dividerColor,
                border: `1px solid ${colors.border.default}`,
                flexShrink: 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
