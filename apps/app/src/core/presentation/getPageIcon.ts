import type { SystemIcon } from '@shared/icon';
import type { PageType } from '@core/vault/models/Page';

/**
 * Returns the canonical default icon for a page type.
 *
 * This is the single source of truth for page icon defaults and should be
 * reused by sidebars, page headers, search results, folder children, and
 * any other page representations instead of hardcoding icon names.
 *
 * `isToday` is a per-instance override, not a per-type default — it only
 * ever changes the result for 'daily-note' (today's date gets the dotted
 * calendar variant, matching the sidebar's own today indicator —
 * DateLabel/isToday in DailyNote.tsx), and is a no-op for every other
 * type. Callers that have a page's actual date pass
 * `isToday(page.name)`/`isToday(draft.title)`; callers that don't
 * (folder icons, tag icons, or a daily-note render site with no date in
 * hand) simply omit it and get today's-vs-not-today's default behavior
 * (false) — no site is required to know about this distinction unless it
 * already has the date.
 */
export function getPageIcon(
  pageType: PageType | 'folder' | 'tag',
  isToday = false
): SystemIcon {
  switch (pageType) {
    case 'note':
      return 'squiggleLine';
    case 'daily-note':
      return isToday ? 'calendarDot' : 'calendarNote';
    case 'folder':
      return 'folder';
    case 'tag':
      return 'tag';
  }
}
