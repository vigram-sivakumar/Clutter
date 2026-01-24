/**
 * HorizontalRule - React node view for horizontal rules
 *
 * Uses inline SVG for wavy pattern with theme-aware colors.
 * Both plain and wavy styles use the same divider color from theme.
 * Supports width toggle: full width or 128px centered.
 */

import { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { patterns, spacing, sizing } from '../tokens';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { useBlockSelection } from '../hooks/useBlockSelection';
import { FoldHorizontal, UnfoldHorizontal } from '@clutter/ui';
import { BlockSelectionHalo } from './BlockSelectionHalo';
import { useBlockHidden } from '../hooks/useBlockHidden';

interface HorizontalRuleProps extends NodeViewProps {
  // NodeViewProps already includes node, we just need to specify updateAttributes
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

  // Check if this block is selected
  const isSelected = useBlockSelection({
    editor,
    getPos,
    nodeSize: node.nodeSize,
  });

  // 🔥 FLAT MODEL: Read indent directly from attributes
  const blockIndent = node.attrs.indent || 0;
  const INDENT_WIDTH = spacing.indent;
  const paddingLeft = blockIndent * INDENT_WIDTH;

  // 🔒 BLOCK IDENTITY: Read blockId (required for Engine sync)
  const blockId = node.attrs.blockId;

  // 🎯 INDENT RENDERING RULE:
  // indent = 0 → Full width (section separator)
  // indent >= 1 → Indented like any other block (left-aligned, not centered)
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

  // 🔒 COLLAPSE CONTRACT: All blocks must expose collapsed state to DOM
  // HR is always collapsed=false (it's a leaf node), but must expose the attribute
  const collapsed = node.attrs.collapsed ?? false;

  // 🔥 COLLAPSE PROPAGATION: Check if we're hidden by a collapsed ancestor
  const isHidden = useBlockHidden(editor, getPos);

  return (
    <NodeViewWrapper
      as="div"
      data-type="horizontalRule"
      data-block-id={blockId}
      data-style={hrStyle}
      data-full-width={fullWidth}
      data-indent={blockIndent}
      data-collapsed={collapsed}
      data-hidden={isHidden ? 'true' : undefined}
      className="block-handle-wrapper"
      style={{
        height: HR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isFullWidth ? 'center' : 'flex-start', // 🔥 Left-align when indented
        position: 'relative',
        cursor: 'pointer',
        paddingLeft,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Craft-style hover-only zones */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          left: -spacing.hoverZoneLeft,
          width: spacing.hoverZoneLeft,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          right: -spacing.hoverZoneRight,
          width: spacing.hoverZoneRight,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />

      {/* HR line container with conditional width */}
      <div
        style={{
          width:
            isFullWidth && fullWidth
              ? '100%' // Full width at root level
              : fullWidth
                ? `calc(100% - ${paddingLeft}px)` // Full remaining width when indented
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
            // border: `1px solid ${colors.border.default}`,
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
              // borderRight: `1px solid ${colors.border.default}`,
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

      {/* Block selection halo */}
      <BlockSelectionHalo isSelected={isSelected} indent={paddingLeft} />
    </NodeViewWrapper>
  );
}
