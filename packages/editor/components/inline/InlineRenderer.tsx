/**
 * InlineRenderer - Segments → React
 *
 * RULES:
 * - View = tokens
 * - Model = plain text
 * - Deterministic rendering
 */

import React from 'react';
import type { Segment } from '../../types/inline';
import { InlineToken } from '../../primitives/InlineToken';
import { TokenPill } from '../../primitives/TokenPill';

interface InlineRendererProps {
  segments: Segment[];
}

export function InlineRenderer({ segments }: InlineRendererProps) {
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i}>{s.value}</span>
        ) : (
          <InlineToken key={i}>
            <TokenPill
              backgroundColor={
                s.token.type === 'hashtag'
                  ? '#eef2ff'
                  : s.token.type === 'date'
                    ? '#fef3c7'
                    : '#f3f4f6'
              }
              color={
                s.token.type === 'hashtag'
                  ? '#4f46e5'
                  : s.token.type === 'date'
                    ? '#92400e'
                    : '#374151'
              }
            >
              {s.token.type === 'hashtag' && '#'}
              {s.token.type === 'date' && '@'}
              {s.token.value}
            </TokenPill>
          </InlineToken>
        )
      )}
    </>
  );
}
