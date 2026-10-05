import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { Asset } from '@core/vault/models/Asset';
import type { PropertyId } from '@core/properties/collectionProperties';
import type { SortOptions } from '@core/properties/collectionSort';

import type { CollectionEntryValues } from '../../page/CollectionEntryModel';

/**
 * An asset together with its collection property values — the thin pair the assets collection
 * sorts and reads its facts from. (Assets are not folded into `CollectionEntryModel`: that is
 * the note/folder entry, with note-only payload an asset has no use for.)
 */
export interface AssetEntry {
  readonly asset: Asset;
  readonly values: CollectionEntryValues;
}

/**
 * The asset adapter: the one place that knows where an asset's property values come from. The
 * name is the extension-free name shown; size, Created and Last edited are the vault file's own
 * facts (`VaultResource.metadata`, read once by Ingest/Sync — nothing is stat'd here). A remote
 * asset is a URL with no file, and a platform may not report every part: each is simply absent.
 */
export function toAssetEntry(asset: Asset): AssetEntry {
  const metadata = asset.source === 'local' ? asset.resource.metadata : undefined;

  return {
    asset,
    values: {
      name: getResourceDisplayName(asset),
      ...(metadata && Number.isFinite(metadata.size) && { size: metadata.size }),
      ...(metadata?.createdAt && { created: metadata.createdAt }),
      ...(metadata?.modifiedAt && { updated: metadata.modifiedAt }),
    },
  };
}

/**
 * How the assets collection breaks ties: File size, Created and Last edited fall back to Name,
 * everything else keeps its ties in the order given. (The notes collections break the ties of
 * Description and Cover image by Name instead — see `NOTE_SORT_OPTIONS`; the two have always
 * differed and this preserves both.)
 */
export const ASSET_SORT_OPTIONS: SortOptions = {
  nameTieBreak: new Set<PropertyId>(['size', 'created', 'updated']),
};
