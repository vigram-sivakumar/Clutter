import { createElement, type ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { Asset } from '@core/vault/models/Asset';

import type { CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';
import { CollectionMedia } from '@features/collection/components/media/CollectionMedia';
import type { AssetTableColumnVisibility } from './assetTableColumns';
import { assetFileFacts } from './assetCardMetadata';
import { ASSET_KIND_LABEL } from './assetKind';
import { AssetPreview } from './AssetPreview';

export interface AssetListItemOptions {
  /** The asset's loadable URL (a local file's `Application.resolveResourceImageUrl(path)`, a remote asset's own URL), for the preview. Absent, the preview shows the kind's icon. */
  readonly url?: string;
  /** Which file facts the list shows after the kind — the same Properties the card and the table use. */
  readonly show: AssetTableColumnVisibility;
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as an item of the generic collection list: its name, kind
 * label, the file facts the Properties turn on (size, created, last edited) and, in place of an icon, its preview thumbnail (`AssetPreview`, the same one the table shows). The row carries `data-resource-id` (vault files only), which the body's F2-to-rename
 * handler looks up; a remote asset's metadata says so. Drawing the row is `CollectionDataList`'s job.
 */
export function toAssetListItem(
  asset: Asset,
  { url, show, onClick, titleContent }: AssetListItemOptions
): CollectionDataListItem {
  // File facts come from the vault file's own metadata; a remote asset has none.
  const facts = asset.source === 'local' ? assetFileFacts(asset.resource) : {};

  return {
    id: asset.id,
    // The preview stands where the icon would: the image itself, a PDF's first page, or the kind's icon.
    leading: createElement(CollectionMedia, null, createElement(AssetPreview, { kind: asset.kind, url })),
    title: getResourceDisplayName(asset),
    titleContent,
    metadata: [
      ASSET_KIND_LABEL[asset.kind],
      ...(asset.source === 'remote' ? ['Remote'] : []),
      ...(show.size && facts.size ? [facts.size] : []),
      ...(show.created && facts.created ? [facts.created] : []),
      ...(show.updated && facts.modified ? [facts.modified] : []),
    ],
    onClick: onClick ? () => onClick(asset) : undefined,
    // Only a vault file can be renamed in place, so only it carries the id F2 looks up.
    props: asset.source === 'local' ? { 'data-resource-id': asset.resource.id } : {},
  };
}
