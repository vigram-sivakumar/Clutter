/**
 * Callout Block Chrome
 *
 * Visual structure for Callout blocks: Bordered surface with icon and variant colors
 *
 * Layout:
 * [Icon 24px container] [Content flex-1]
 *
 * Responsibilities:
 * - Render variant-specific styling (info, warning, error, success)
 * - Display appropriate icon for variant
 * - Apply variant-specific colors (border, background, icon)
 *
 * Does NOT:
 * - Mutate block store directly
 * - Contain business logic
 */

import React from 'react';
import { Info, AlertTriangle, XCircle, CheckCircle } from '@clutter/ui';
import { useBlockStore } from '../../store/blockStore';
import { useEditorTheme } from '../../../theme/EditorThemeContext';
import type { CalloutVariant } from '../../blocks/schemas/callout';

interface CalloutChromeProps {
  blockId: string;
  children: React.ReactNode; // Lexical editor
}

export function CalloutChrome({ blockId, children }: CalloutChromeProps) {
  const block = useBlockStore((s) => s.getBlock(blockId));
  const { colors } = useEditorTheme();

  if (!block) {
    return <>{children}</>;
  }

  const variant = (block.properties?.variant as CalloutVariant) || 'info';

  // Variant-specific configuration
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
      <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>{children}</div>
    </div>
  );
}
