/**
 * Block Chrome Wrapper
 *
 * Adds visual structure around blocks based on block type:
 * - Quotes: Orange marker bar (4px) in 24px container
 * - Code: Bordered surface with icon
 * - Others: Plain wrapper
 *
 * Matches old TipTap block primitive architecture exactly.
 */

import React from 'react';
import { useBlockStore } from '../store/blockStore';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import {
  Code as CodeIcon,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  ChevronDown,
  Sticker,
} from '@clutter/ui';
import type { BlockType } from '../types/Block';

interface BlockChromeWrapperProps {
  blockId: string;
  children: React.ReactNode;
}

/**
 * Wraps a block editor with appropriate chrome based on block type
 */
export function BlockChromeWrapper({
  blockId,
  children,
}: BlockChromeWrapperProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  if (!block) {
    return <>{children}</>;
  }

  const blockType = block.type;

  // Quote blocks: Two-column layout with orange marker bar
  if (blockType === 'quote') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px', // spacing.inline
        }}
      >
        {/* Marker container - 24px wide */}
        <div
          style={{
            width: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {/* Orange bar - 4px wide */}
          <div
            className="blockquote-line"
            style={{
              width: '4px',
              alignSelf: 'stretch', // Fill height
              backgroundColor: colors.semantic.orange,
              borderRadius: '2px',
            }}
          />
        </div>

        {/* Content column */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: colors.text.secondary, // Secondary text color for quotes
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Code blocks: Bordered surface with icon
  if (blockType === 'code') {
    return (
      <div
        data-styled-surface
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '8px',
          alignItems: 'flex-start',
          padding: '16px',
          backgroundColor: colors.background.secondary,
          border: `1px solid ${colors.border.default}`,
          borderRadius: '4px',
          overflow: 'auto',
        }}
      >
        {/* Code icon */}
        <div
          style={{
            padding: '4px',
            borderRadius: '3px',
            color: colors.text.tertiary,
            opacity: 0.4,
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CodeIcon size={16} />
        </div>

        {/* Code content */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // Divider blocks: Horizontal lines (plain or wavy)
  if (blockType === 'divider') {
    const style = block.properties?.style || 'plain';
    const dividerColor = colors.border.divider;

    return (
      <div
        style={{
          height: '24px', // Clickable hit area
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {style === 'wavy' ? (
          // Wavy divider using SVG pattern
          <svg
            width="128px"
            height="6"
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <defs>
              <pattern
                id={`wavePattern-${blockId}`}
                patternUnits="userSpaceOnUse"
                width="16"
                height="6"
              >
                <path
                  d="M0 3 C4 3, 4 1, 8 1 S12 3, 16 3"
                  stroke={dividerColor}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  fill="none"
                />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="6"
              fill={`url(#wavePattern-${blockId})`}
            />
          </svg>
        ) : (
          // Plain divider (simple line)
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: dividerColor,
            }}
          />
        )}
      </div>
    );
  }

  // Checklist blocks: Checkbox + content with conditional styling
  if (blockType === 'checklist') {
    const checked = block.properties?.checked === true;

    const handleCheckboxChange = () => {
      // Toggle checked state in block store
      useBlockStore.getState().updateProperties(blockId, {
        checked: !checked,
      });
    };

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        {/* Marker container - 24px wide */}
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
          {/* Checkbox - 16px */}
          <input
            type="checkbox"
            checked={checked}
            onChange={handleCheckboxChange}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus steal
            style={{
              width: '16px',
              height: '16px',
              cursor: 'pointer',
              margin: 0,
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

  // Callout blocks: Bordered surface with icon and variant colors
  if (blockType === 'callout') {
    const variant =
      (block.properties?.variant as 'info' | 'warning' | 'error' | 'success') ||
      'info';

    // Variant-specific styling
    const variantConfig = {
      info: {
        borderColor: colors.semantic.info + '75',
        backgroundColor: colors.semantic.info + '08',
        iconColor: colors.semantic.info,
        iconBackground: colors.semantic.info + '15',
        Icon: Info,
      },
      warning: {
        borderColor: colors.semantic.warning + '75',
        backgroundColor: colors.semantic.warning + '08',
        iconColor: colors.semantic.warning,
        iconBackground: colors.semantic.warning + '15',
        Icon: AlertTriangle,
      },
      error: {
        borderColor: colors.semantic.error + '75',
        backgroundColor: colors.semantic.error + '08',
        iconColor: colors.semantic.error,
        iconBackground: colors.semantic.error + '15',
        Icon: XCircle,
      },
      success: {
        borderColor: colors.semantic.success + '75',
        backgroundColor: colors.semantic.success + '08',
        iconColor: colors.semantic.success,
        iconBackground: colors.semantic.success + '15',
        Icon: CheckCircle,
      },
    };

    const config = variantConfig[variant];
    const IconComponent = config.Icon;

    return (
      <div
        data-styled-surface
        data-callout-variant={variant}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          padding: '16px',
          backgroundColor: config.backgroundColor,
          border: `1px solid ${config.borderColor}`,
          borderRadius: '4px',
        }}
      >
        {/* Icon container - rounded with variant background */}
        <div
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: config.iconBackground,
            borderRadius: '4px',
            marginTop: '1px',
          }}
        >
          <IconComponent size={14} color={config.iconColor} />
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
          {children}
        </div>
      </div>
    );
  }

  // Toggle blocks: Chevron + content + collapse logic
  if (blockType === 'toggle') {
    const collapsed = block.properties?.collapsed === true;

    const handleToggleCollapse = () => {
      useBlockStore.getState().updateProperties(blockId, {
        collapsed: !collapsed,
      });
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
          {/* Marker container - 24px wide */}
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
            onClick={handleToggleCollapse}
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
              marginLeft: '32px', // Align with content (24px marker + 8px gap)
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
            onClick={handleToggleCollapse}
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

  // Field blocks: Icon + Label (fixed 120px) + Value (flex)
  if (blockType === 'field') {
    const icon = block.properties?.icon as string | undefined;
    const label = (block.properties?.label as string) || '';

    const handleLabelInput = (e: React.FormEvent<HTMLSpanElement>) => {
      const newLabel = e.currentTarget.textContent || '';
      useBlockStore.getState().updateProperties(blockId, {
        label: newLabel,
      });
    };

    const isEmpty = label.trim() === '';

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
            width: '16px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '16px',
            color: colors.text.tertiary,
          }}
        >
          {icon ? icon : <Sticker size={16} />}
        </div>

        {/* Label - fixed 120px width, plain text with always-visible placeholder */}
        <div style={{ position: 'relative', width: '120px', flexShrink: 0 }}>
          <span
            contentEditable
            suppressContentEditableWarning
            onInput={handleLabelInput}
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

        {/* Value - flex 1, rich text (has its own PlaceholderPlugin) */}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    );
  }

  // Default: Plain wrapper for paragraphs, headings, lists
  return <>{children}</>;
}
