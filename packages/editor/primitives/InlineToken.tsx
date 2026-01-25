import React from 'react';

interface InlineTokenProps {
  children: React.ReactNode;
  as?: 'span';
}

export function InlineToken({
  children,
  as = 'span',
}: InlineTokenProps) {
  const Component = as;

  return (
    <Component
      className="inline-token"
      data-inline-token
      contentEditable={false}
      style={{
        /* THE ONLY INLINE PARTICIPANT */
        display: 'inline-block',
        verticalAlign: 'baseline',

        /* Lock line metrics */
        height: '1em',
        lineHeight: '1em',
        fontSize: 'inherit',

        /* Anchor absolute visuals */
        position: 'relative',

        padding: 0,
        margin: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {/* WIDTH RESERVATION (layout-only) */}
      <span
        aria-hidden
        style={{
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {children}
      </span>

      {/* VISUAL LAYER (absolute, no layout impact) */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'auto',
        }}
      >
        {children}
      </span>
    </Component>
  );
}