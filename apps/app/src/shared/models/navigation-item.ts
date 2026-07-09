import type { SystemIcon } from '@shared/icon';

/**
 * Represents a single navigation item.
 */
export interface NavigationItem {
  id: string;
  title: string;

  /**
   * Default system icon.
   */
  icon: SystemIcon;

  /**
   * Optional emoji chosen by the user.
   * When present, it overrides the system icon.
   */
  emoji?: string;
}
