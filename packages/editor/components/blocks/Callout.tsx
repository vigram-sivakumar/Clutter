/**
 * Callout - React node view for callout boxes with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Styled callout boxes for info, warning, error, success messages.
 * Uses marginLeft for indentation (indentMode: 'margin').
 */

import React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Info, AlertTriangle, XCircle, CheckCircle } from '@clutter/ui';
import { typography } from '../../tokens';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { useBlock, BlockHoverZones, BlockSelectionHalo } from './primitives';

type CalloutType = 'info' | 'warning' | 'error' | 'success';

const getCalloutStyles = (
  type: CalloutType,
  colors: ReturnType<typeof useEditorTheme>['colors']
) => {
  const styles = {
    info: {
      borderColor: colors.semantic.info + '75',
      backgroundColor: colors.semantic.info + '08',
      iconColor: colors.semantic.info,
      iconBackground: colors.semantic.info + '15',
    },
    warning: {
      borderColor: colors.semantic.warning + '75',
      backgroundColor: colors.semantic.warning + '08',
      iconColor: colors.semantic.warning,
      iconBackground: colors.semantic.warning + '15',
    },
    error: {
      borderColor: colors.semantic.error + '75',
      backgroundColor: colors.semantic.error + '08',
      iconColor: colors.semantic.error,
      iconBackground: colors.semantic.error + '15',
    },
    success: {
      borderColor: colors.semantic.success + '75',
      backgroundColor: colors.semantic.success + '08',
      iconColor: colors.semantic.success,
      iconBackground: colors.semantic.success + '15',
    },
  };
  return styles[type] || styles.info;
};

const getIcon = (type: CalloutType, color: string, size: number) => {
  const iconProps = {
    size,
    color,
    style: { flexShrink: 0 } as React.CSSProperties,
  };

  switch (type) {
    case 'info':
      return <Info {...iconProps} />;
    case 'warning':
      return <AlertTriangle {...iconProps} />;
    case 'error':
      return <XCircle {...iconProps} />;
    case 'success':
      return <CheckCircle {...iconProps} />;
    default:
      return <Info {...iconProps} />;
  }
};

export function Callout({ node, editor, getPos }: NodeViewProps) {
  const { colors } = useEditorTheme();
  const type = (node.attrs.type as CalloutType) || 'info';
  const styles = getCalloutStyles(type, colors);

  // Use block primitives with marginLeft indentation (not paddingLeft)
  const { wrapperProps, isSelected, indent } = useBlock({
    node,
    editor,
    getPos,
    indentMode: 'margin', // Critical: Callout uses marginLeft, not paddingLeft
    styleOverrides: {
      display: 'flex', // Callout-specific: flex layout
      alignItems: 'flex-start',
      gap: 8,
      padding: 16,
      backgroundColor: styles.backgroundColor,
      border: `1px solid ${styles.borderColor}`,
      borderRadius: 4,
    },
  });

  return (
    <NodeViewWrapper
      as="div"
      {...wrapperProps}
      data-callout-type={type}
      className="callout-block"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Icon container - rounded with background */}
      <div
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: styles.iconBackground,
          borderRadius: 4,
          marginTop: '1px',
        }}
      >
        {getIcon(type, styles.iconColor, 14)}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
        <NodeViewContent
          style={{
            color: colors.text.default,
          }}
        />
      </div>

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={indent} />
    </NodeViewWrapper>
  );
}
