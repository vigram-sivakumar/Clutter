/**
 * InlineToken - The ONLY inline participant
 * 
 * Purpose:
 * - Own the inline baseline
 * - Isolate editor / NodeView / React wrappers
 * - Guarantee identical alignment across all mentions
 * - Fix inline box height to match text (prevent cursor growth)
 * 
 * Rules (enforced):
 * - Exactly one element participates in inline flow
 * - That element is inline-block
 * - Height is FIXED to 1em (matches text, prevents cursor growth)
 * - No flex, no padding at this level
 * - No font-size changes
 * - No vertical-align hacks elsewhere
 * 
 * Critical Architecture:
 * - This creates a 1em × 1em layout box (matches text height)
 * - Visual pill inside is absolutely positioned (doesn't affect line height)
 * - This is how Notion/Craft prevent cursor growth
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
        
        // CRITICAL: Fixed height to match text (prevents cursor growth)
        fontSize: '1em',
        lineHeight: '1em',
        height: '1em',
        
        // Position context for absolutely positioned pill
        position: 'relative',
        
        padding: 0,
        margin: 0,
      }}
    >
      {children}
    </Component>
  );
}
