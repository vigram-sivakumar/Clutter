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
        
        // CRITICAL: Never define line-height or font-size other than these
        lineHeight: 1,
        fontSize: '1em',
        
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        
        // Visual styling
        backgroundColor,
        color,
        cursor: onClick ? 'pointer' : 'default',
        
        // Allow overrides (but fontSize/lineHeight should never be overridden)
        ...style,
      }}
    >
      {icon && (
        <span 
          className="token-pill__icon"
          style={{
            // CRITICAL: inline-block, NOT inline-flex
            // This prevents SVG from participating in flex baseline math
            display: 'inline-block',
            verticalAlign: 'text-top',
            
            // Icon sizing - use em units to scale with text
            width: '1em',
            height: '1em',
            flexShrink: 0,
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
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    </span>
  );
}
