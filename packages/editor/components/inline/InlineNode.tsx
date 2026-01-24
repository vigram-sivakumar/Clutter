/**
 * Inline Node Component
 * 
 * Shared component for inline node elements (Date, Link, etc.)
 * Provides consistent styling based on Date component design
 */

import React from 'react';
import { animations } from '@clutter/ui';
import { spacing, sizing, typography, getWaveStyles, patterns } from '../tokens';

interface InlineNodeProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  color: string;
  hoverColor: string;
  iconColor?: string; // Optional subtle color for icon
  wavyUnderline?: boolean; // Use custom wave pattern underline
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  as?: 'span' | 'a';
  href?: string;
  'data-type'?: string;
}

export const InlineNode = ({
  icon,
  children,
  color,
  hoverColor,
  iconColor,
  wavyUnderline,
  onClick,
  as = 'span',
  href,
  'data-type': dataType,
}: InlineNodeProps) => {
  // Get wave styles if wavyUnderline is enabled
  const waveStyles = wavyUnderline ? getWaveStyles(color) : null;

  const defaultStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: '-2px', // Offset to align with text baseline
    gap: spacing.xs,
    borderRadius: sizing.radius.sm,
    color,
    fontSize: typography.fontSize['16'],
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeightPx.base,
    height: typography.lineHeightPx.sm, // Force exact 20px height
    cursor: 'pointer',
    userSelect: 'none',
    transition: `color ${animations.duration.fast} ${animations.easing.smooth}`,
    textDecoration: 'none',
    // Wave underline styles (SVG background)
    ...(waveStyles && {
      backgroundImage: waveStyles.backgroundImage,
      backgroundRepeat: waveStyles.backgroundRepeat,
      backgroundPosition: waveStyles.backgroundPosition,
      backgroundSize: waveStyles.backgroundSize,
      paddingBottom: `${patterns.wave.height - 1}px`,
    }),
  };

  // Icon wrapper with optional subtle color
  const iconWrapperStyle: React.CSSProperties = iconColor ? {
    color: iconColor,
    display: 'inline-flex',
    alignItems: 'center',
  } : {};

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement | HTMLAnchorElement>) => {
    e.currentTarget.style.color = hoverColor;
    // Update wave underline color on hover
    if (wavyUnderline) {
      const hoverWaveStyles = getWaveStyles(hoverColor);
      e.currentTarget.style.backgroundImage = hoverWaveStyles.backgroundImage;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLSpanElement | HTMLAnchorElement>) => {
    e.currentTarget.style.color = color;
    // Reset wave underline color
    if (wavyUnderline && waveStyles) {
      e.currentTarget.style.backgroundImage = waveStyles.backgroundImage;
    }
  };

  const iconElement = iconColor ? (
    <span style={iconWrapperStyle}>{icon}</span>
  ) : icon;

  if (as === 'a' && href) {
    return (
      <a
        href={href}
        style={defaultStyle}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent<HTMLSpanElement>);
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-type={dataType}
      >
        {iconElement}
        {children}
      </a>
    );
  }

  return (
    <span
      style={defaultStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-type={dataType}
    >
      {iconElement}
      {children}
    </span>
  );
};
