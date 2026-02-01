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
 * - contentEditable: false to prevent caret placement
 * - userSelect: 'none' to prevent text selection
 * - cursor: 'default' (not I-beam, not pointer - invisible detection zones)
 * - Dimensions defined in tokens.ts (spacing.hoverZoneLeft/Right)
 *
 * CRITICAL:
 * These zones live inside NodeViewWrapper (contenteditable tree) but must
 * not be editable. Browser would otherwise show I-beam cursor and allow
 * caret placement, causing click/focus/selection bugs.
 *
 * NOTE:
 * These are invisible hover DETECTION zones, not directly clickable elements.
 * They trigger chrome to appear - the chrome BUTTONS are what's clickable.
 */

import { spacing } from '../../../tokens';

export function BlockHoverZones() {
  return (
    <>
      {/* Left hover zone */}
      <div
        data-hover-only="true"
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          position: 'absolute',
          top: 0,
          left: -spacing.hoverZoneLeft,
          width: spacing.hoverZoneLeft,
          height: '100%',
          pointerEvents: 'auto',
          userSelect: 'none',
          cursor: 'default',
        }}
      />

      {/* Right hover zone */}
      <div
        data-hover-only="true"
        contentEditable={false}
        suppressContentEditableWarning
        style={{
          position: 'absolute',
          top: 0,
          right: -spacing.hoverZoneRight,
          width: spacing.hoverZoneRight,
          height: '100%',
          pointerEvents: 'auto',
          userSelect: 'none',
          cursor: 'default',
        }}
      />
    </>
  );
}
