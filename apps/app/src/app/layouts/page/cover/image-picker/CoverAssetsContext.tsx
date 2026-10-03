import { createContext, useContext } from 'react';

/** One image the cover picker's Asset tab can offer. */
export interface CoverPickerAsset {
  readonly id: string;
  readonly name: string;
  /** A loadable `<img src>` for the thumbnail. */
  readonly previewUrl: string;
  /** The value stored as the page's `cover`: a vault-relative path, or the remote URL. */
  readonly cover: string;
}

/**
 * Where the picker reads the vault's image assets from. A context rather than a
 * prop because the picker is hosted in three places (page cover, header menu,
 * collection overlay) and none of them owns the Application; whoever does
 * provides it once. Without a provider the Asset tab is simply empty.
 */
const CoverAssetsContext = createContext<() => readonly CoverPickerAsset[]>(
  () => []
);

export const CoverAssetsProvider = CoverAssetsContext.Provider;

export function useCoverPickerAssets(): readonly CoverPickerAsset[] {
  return useContext(CoverAssetsContext)();
}
