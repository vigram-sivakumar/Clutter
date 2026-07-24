import type { Page } from '@core/vault/models';

export function getChildPages(pages: Page[], parentId: string | null) {
  return pages.filter((page) => page.parentId === parentId);
}
