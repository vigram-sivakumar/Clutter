/**
 * ChromeRight - Right-side block chrome (action menu)
 *
 * CURRENT STATE: Empty placeholder
 *
 * FUTURE RESPONSIBILITIES:
 * - Render action menu trigger (⋯)
 * - Position relative to hovered block
 * - Open context menu on click (duplicate, turn into, move, delete)
 * - Respect typing suppression (hide while typing, show on mouse move)
 *
 * ARCHITECTURAL NOTES:
 * - Chrome is editor-owned, not block-owned
 * - Chrome is ephemeral (appears/disappears with hover)
 * - Menu is action-only (clicking does NOT select the block)
 */

interface ChromeRightProps {
  blockId: string;
  // Future props:
  // position?: { top: number; right: number };
  // indent?: number;
  // isVisible?: boolean;
}

export function ChromeRight(_props: ChromeRightProps) {
  // Not used yet - placeholder only
  // Future implementation will:
  // - Position absolutely relative to block
  // - Render ⋯ menu trigger (hover-only)
  // - Open context menu on click
  // - Handle menu interactions

  return null;
}
