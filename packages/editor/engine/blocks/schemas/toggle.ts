/**
 * Toggle Block Schema
 *
 * Defines the property shape and defaults for Toggle blocks.
 * A Toggle is a collapsible block that can show/hide child blocks.
 *
 * Future evolution:
 * - v2: default collapsed state preference
 * - v3: nested toggle behavior
 * - v4: collapse all children recursively
 */

export interface ToggleBlockProperties {
  /** Whether the toggle block is collapsed (children hidden) */
  collapsed: boolean;
}

/**
 * Default properties when creating a new Toggle block
 */
export const TOGGLE_BLOCK_DEFAULTS: ToggleBlockProperties = {
  collapsed: false, // Expanded by default
};
