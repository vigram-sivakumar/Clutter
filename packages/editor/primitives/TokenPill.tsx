/**
 * TokenPill - Internal layout for inline tokens
 * 
 * Responsibilities (allowed):
 * - Use inline-flex
 * - Align icons
 * - Set background
 * - Control height
 * - Handle hover, cursor, focus
 * 
 * Must NEVER:
 * - Escape inline flow
 * - Change vertical alignment
 * - Rely on negative offsets
 */

import React from 'react';

type TokenVariant = 'hashtag' | 'date' | 'page' | 'mention';

interface TokenPillProps {
  variant: TokenVariant;
  icon?: React.ReactNode;
  children: React.ReactNode;
  backgroundColor?: string;
  color?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function TokenPill({
  variant,
  icon,
  children,
  backgroundColor,
  color,
  onClick,
  style,
}: TokenPillProps) {
  return (
    <span
      className={`token-pill token-pill--${variant}`}
      data-token-pill
      data-variant={variant}
      onClick={onClick}
      style={{
        // Core layout (internal only)
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        
        // Visual styling
        backgroundColor,
        color,
        cursor: onClick ? 'pointer' : 'default',
        
        // Allow overrides
        ...style,
      }}
    >
      {icon && (
        <span 
          className="token-pill__icon"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      <span 
        className="token-pill__label"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {children}
      </span>
    </span>
  );
}
