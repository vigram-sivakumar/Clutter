/**
 * BlockHoverZones - Invisible hover detection areas
 *
 * Creates two absolutely-positioned divs that extend into left/right gutters.
 * These trigger chrome visibility when hovered.
 *
 * Used by ALL blocks - single source of truth for hover dimensions.
 *
 * Architecture:
 * - Always rendered (not conditional)
 * - Positioned absolutely outside block content
 * - pointerEvents: 'auto' to capture hover
 * - Dimensions defined in tokens.ts (spacing.hoverZoneLeft/Right)
 */

import { spacing } from '../../../tokens';

export function BlockHoverZones() {
  return (
    <>
      {/* Left hover zone */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          left: -spacing.hoverZoneLeft,
          width: spacing.hoverZoneLeft,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />

      {/* Right hover zone */}
      <div
        data-hover-only="true"
        style={{
          position: 'absolute',
          top: 0,
          right: -spacing.hoverZoneRight,
          width: spacing.hoverZoneRight,
          height: '100%',
          pointerEvents: 'auto',
        }}
      />
    </>
  );
}
