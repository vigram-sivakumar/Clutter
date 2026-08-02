import type { PageType } from '../vault/models/Page';

/**
 * The one owner of placeholder copy for an untitled page. Every surface
 * that needs to show "this page has no title yet" text — the display
 * label's own fallback, the page header, breadcrumbs, and the draft
 * lifecycle before a page is even persisted — reads from here, so the
 * copy can't drift between call sites the way five independent string
 * literals would.
 */
export function getPageTitlePlaceholder(type: PageType): string {
  return type === 'daily-note' ? 'Daily Note' : 'New Note';
}
