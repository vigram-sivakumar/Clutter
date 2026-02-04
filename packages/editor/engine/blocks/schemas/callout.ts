/**
 * Callout Block Schema
 *
 * Defines the property shape and defaults for Callout blocks.
 * A Callout is a highlighted block with variant-specific styling and icons.
 *
 * Future evolution:
 * - v2: custom icons per callout
 * - v3: collapsible callouts
 * - v4: custom colors
 */

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success';

export interface CalloutBlockProperties {
  /** Visual variant determining icon and color scheme */
  variant: CalloutVariant;
}

/**
 * Default properties when creating a new Callout block
 */
export const CALLOUT_BLOCK_DEFAULTS: CalloutBlockProperties = {
  variant: 'info', // Default to info variant
};
