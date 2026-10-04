import type { Page } from '../../vault/models';
import { ImageReferenceExtractor } from '../../vault/ingest/extractors/ImageReferenceExtractor';
import { pickAssetDisplayName } from '../../vault/asset/assetDisplayName';

const imageExtractor = new ImageReferenceExtractor();

/**
 * What to call a remote image once it is saved: the display text a user typed
 * for it, `![display text](url)`, in the notes that use it. Active notes come
 * before archived ones and each group is read in path order, so the answer
 * does not depend on the order the Vault happens to hold pages in. The first
 * display text that makes a usable name wins (generic ones such as "image" are
 * skipped); `undefined` means none did — a cover has no display text — and the
 * caller falls back to the URL's own name.
 */
export function findRemoteImageDisplayName(
  url: string,
  pages: Iterable<Page>,
  currentMarkdown: (page: Page) => string,
  isArchived: (page: Page) => boolean
): string | undefined {
  const ordered = [...pages].sort(
    (a, b) => Number(isArchived(a)) - Number(isArchived(b)) || a.path.localeCompare(b.path)
  );

  return pickAssetDisplayName(
    (function* () {
      for (const page of ordered) {
        for (const image of imageExtractor.extractImages(currentMarkdown(page))) {
          if (image.src === url) {
            yield image.alt;
          }
        }
      }
    })()
  );
}
