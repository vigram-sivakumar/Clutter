/**
 * ChromeLeft - Left-side block chrome (insert + handle)
 *
 * CURRENT STATE: Empty placeholder
 *
 * FUTURE RESPONSIBILITIES:
 * - Render insert button (+) - creates block below, opens slash menu
 * - Render drag/select handle (⋮⋮) - block selection + drag interaction
 * - Position relative to hovered block
 * - Respect typing suppression (hide while typing, show on mouse move)
 *
 * ARCHITECTURAL NOTES:
 * - Chrome is editor-owned, not block-owned
 * - Chrome is ephemeral (appears/disappears with hover)
 * - Chrome does NOT encode semantic state (selection halos are block-owned)
 */

interface ChromeLeftProps {
  blockId: string;
  // Future props:
  // position?: { top: number; left: number };
  // indent?: number;
  // isVisible?: boolean;
}

export function ChromeLeft(_props: ChromeLeftProps) {
  // Not used yet - placeholder only
  // Future implementation will:
  // - Position absolutely relative to block
  // - Render + button (always visible when chrome is shown)
  // - Render ⋮⋮ handle (hover-only)
  // - Handle click interactions

  return null;
}
