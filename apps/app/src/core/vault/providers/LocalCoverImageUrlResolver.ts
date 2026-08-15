import { convertFileSrc } from '@tauri-apps/api/core';

import type { CoverImageUrlResolver } from './CoverImageUrlResolver';

/**
 * Tauri desktop implementation — the only place convertFileSrc is used.
 */
export class LocalCoverImageUrlResolver implements CoverImageUrlResolver {
  toLoadableUrl(absolutePath: string): string {
    return convertFileSrc(absolutePath);
  }
}

export const localCoverImageUrlResolver = new LocalCoverImageUrlResolver();
