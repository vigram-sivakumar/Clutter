/**
 * MentionPill - Shared component for all mention types
 * 
 * Provides consistent styling for date mentions, note links, folder links, etc.
 * Used by DateMentionView and NoteLinkView.
 */

import React, { useState, useEffect } from 'react';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { spacing } from '../tokens';

interface MentionPillProps {
  icon: React.ReactNode;
  label: string;
  className?: string;
  dataType?: string;
  onClick?: () => void;
  [key: string]: any; // For additional data attributes
}

export function MentionPill({ 
  icon, 
  label, 
  className = '', 
  dataType,
  onClick,
  ...rest 
}: MentionPillProps) {
  const { colors } = useEditorTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [hoverEnabled, setHoverEnabled] = useState(false);

  // Enable hover effects after a short delay to prevent immediate hover on insertion
  useEffect(() => {
    const timer = setTimeout(() => {
      setHoverEnabled(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const pillStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    verticalAlign: '-2.5px',
    alignItems: 'center',
    gap: spacing['4'],
    color: (isHovered && hoverEnabled) ? colors.text.hover : colors.text.tertiary,
    // backgroundColor: (isHovered && hoverEnabled) ? colors.background.hover : colors.background.tertiary,
    // padding: '0px 4px',
    // margin: spacing['2'],
    // borderRadius: '3px',
    // height: '22px',
    cursor: 'pointer',
    transition: 'color 300ms ease, background-color 300ms ease',
    
  };

  const iconStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: '24px',
    fontSize: '16px',
  };

  // Clone icon and apply size directly to the SVG
  const iconSize = 16;
  const styledIcon = React.isValidElement(icon)
    ? React.cloneElement(icon, {
        style: { width: `${iconSize}px`, height: `${iconSize}px` },
      } as any)
    : icon;

  return (
    <span 
      className={`mention-pill ${className}`}
      data-type={dataType}
      style={pillStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      {...rest}
    >
      <span className="mention-icon" style={iconStyle}>{styledIcon}</span>
      <span className="mention-label" style={labelStyle}>{label}</span>
    </span>
  );
}

