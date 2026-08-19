import type { CoverImageUrlResolver } from './CoverImageUrlResolver';

/**
 * Web-runtime counterpart to LocalCoverImageUrlResolver. The in-memory web
 * vault has no real files on disk for convertFileSrc() to resolve, so there
 * is nothing to convert — this returns the path unchanged (it is not a
 * loadable URL, but no cover asset scope exists to load it from in this
 * runtime either way).
 */
export class BrowserCoverImageUrlResolver implements CoverImageUrlResolver {
  toLoadableUrl(absolutePath: string): string {
    return absolutePath;
  }
}

export const browserCoverImageUrlResolver = new BrowserCoverImageUrlResolver();
