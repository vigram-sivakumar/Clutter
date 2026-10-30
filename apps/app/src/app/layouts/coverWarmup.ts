import { useEffect } from 'react';

import type { Application } from '@core/application/Application';
import { warmCoverImages } from '@shared/helpers/coverImagePreloader';

/** How many other covers are warmed at startup. A bound on background bandwidth: each can be hundreds of KB to a few MB. */
export const WARM_COVER_LIMIT = 12;

/** Wait for the app to settle before any background download starts. */
const WARMUP_DELAY_MS = 2_500;

/**
 * The display addresses of the covers worth having ready: every shown (not hidden) cover of an active note or
 * folder, resolved exactly as the page resolves it (a vault file's loadable URL, a remote URL as stored), each
 * once. Archived items are skipped — nobody switches to them.
 */
export function coverImageUrlsToWarm(application: Application, limit: number = WARM_COVER_LIMIT): string[] {
  const { vault } = application;
  const urls = new Set<string>();

  const add = (cover: string | null, hidden: boolean) => {
    if (!cover || hidden || urls.size >= limit) {
      return;
    }
    const url = application.resolveCoverImageForDisplay(cover);
    if (url) {
      urls.add(url);
    }
  };

  for (const page of vault.pages()) {
    if (!vault.isPageEffectivelyArchived(page)) {
      add(page.metadata.cover, page.metadata.coverHidden);
    }
  }
  for (const folder of vault.folders()) {
    if (!vault.isFolderEffectivelyArchived(folder.id)) {
      add(folder.metadata.cover, folder.metadata.coverHidden);
    }
  }

  return [...urls];
}

/**
 * After startup, quietly loads and decodes the covers of the vault's notes and folders, so switching to one shows
 * its cover immediately instead of after a download. Low priority and one at a time (`warmCoverImages`), bounded
 * by `WARM_COVER_LIMIT`; the HTTP cache keeps them for the next launch. A cover set later is held as soon as it is
 * shown (`PageCover`).
 */
export function useCoverImageWarmup(application: Application): void {
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void warmCoverImages(coverImageUrlsToWarm(application), () => cancelled);
    }, WARMUP_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [application]);
}
