import type { CoverCredit, Folder, Page } from '../../vault/models';

/**
 * The credit already recorded for an exact cover URL — used when an existing
 * Unsplash image is chosen again without going through the picker (the
 * Assets tab, "Set as cover"), so the photographer isn't lost. Returns null
 * when no page or folder holding that URL has one: never invented, never
 * fetched.
 */
export function findCoverCredit(
  pages: Iterable<Page>,
  folders: Iterable<Folder>,
  url: string
): CoverCredit | null {
  const wanted = url.trim();

  for (const page of pages) {
    if (page.metadata.coverCredit && page.metadata.cover?.trim() === wanted) {
      return page.metadata.coverCredit;
    }
  }

  for (const folder of folders) {
    if (folder.metadata.coverCredit && folder.metadata.cover?.trim() === wanted) {
      return folder.metadata.coverCredit;
    }
  }

  return null;
}
