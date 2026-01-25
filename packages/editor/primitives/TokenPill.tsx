import React from 'react';

interface TokenPillProps {
  children: React.ReactNode;
  variant?: 'hashtag' | 'date' | 'page';
  icon?: React.ReactNode;
  backgroundColor?: string;
  color?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function TokenPill({
  children,
  icon,
  backgroundColor = 'transparent',
  color = 'inherit',
  onClick,
  style,
}: TokenPillProps) {
  return (
    <span
      data-token-pill
      onClick={onClick}
      style={{
        display: 'inline-block',
        fontSize: '1em',
        lineHeight: 1,
        padding: '2px 4px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        backgroundColor,
        color,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {icon && (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: '1em',
            height: '1em',
            marginRight: '4px',
            verticalAlign: 'text-bottom',
          }}
        >
          {icon}
        </span>
      )}

      <span style={{ lineHeight: 1 }}>{children}</span>
    </span>
  );
}