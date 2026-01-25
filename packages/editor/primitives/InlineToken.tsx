/**
 * InlineToken - The ONLY inline participant
 * 
 * Purpose:
 * - Own the inline baseline
 * - Isolate editor / NodeView / React wrappers
 * - Guarantee identical alignment across all mentions
 * 
 * Rules (enforced):
 * - Exactly one element participates in inline flow
 * - That element is inline-block
 * - No flex, no padding, no height
 * - No font-size changes
 * - No vertical-align hacks elsewhere
 */

import React from 'react';

interface InlineTokenProps {
  children: React.ReactNode;
  as?: 'span'; // future-proof, but keep constrained
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
        // Hard invariants - DO NOT MODIFY
        display: 'inline-block',
        verticalAlign: 'baseline',
        padding: 0,
        margin: 0,
        lineHeight: 'inherit',
        fontSize: 'inherit',
      }}
    >
      {children}
    </Component>
  );
}
