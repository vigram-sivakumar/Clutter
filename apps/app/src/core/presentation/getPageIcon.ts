import type { SystemIcon } from '@shared/icon';
import type { PageType } from '@core/vault/models/Page';

/**
 * Returns the canonical default icon for a page type.
 *
 * This is the single source of truth for page icon defaults and should be
 * reused by sidebars, page headers, search results, folder children, and
 * any other page representations instead of hardcoding icon names.
 */
export function getPageIcon(pageType: PageType | 'folder' | 'tag'): SystemIcon {
  switch (pageType) {
    case 'note':
      return 'squiggleLine';
    case 'daily-note':
      return 'calendar';
    case 'folder':
      return 'folder';
    case 'tag':
      return 'tag';
  }
}
