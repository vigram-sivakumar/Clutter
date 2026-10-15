import type { SystemIcon } from '@shared/icon';

/**
 * A single entry in a page's ancestry trail.
 *
 * This is presentation data, not UI props — it knows nothing about how it
 * will be rendered (icon-only, collapsed into an overflow menu, etc.).
 */
export interface Breadcrumb {
  id: string;
  title: string;
  icon?: SystemIcon;
  emoji?: string;
  /** The crumb is the Space root (the Workspace view): drawn with the active Space's avatar, `icon` being the fallback. */
  isSpaceRoot?: boolean;
  onClick?: () => void;
}
