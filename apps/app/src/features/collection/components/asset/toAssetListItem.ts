import { createElement, type ReactNode } from 'react';

import type { PropertyId } from '@core/properties/collectionProperties';
import { formatPropertyValue, valueProperties } from '../../properties/formatProperty';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { Asset } from '@core/vault/models/Asset';

import type { CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';
import { CollectionMedia } from '@features/collection/components/media/CollectionMedia';
import { toAssetEntry } from './toAssetEntry';
import { AssetPreview } from './AssetPreview';

export interface AssetListItemOptions {
  /** The asset's loadable URL (a local file's `Application.resolveResourceImageUrl(path)`, a remote asset's own URL), for the preview. Absent, the preview shows the kind's icon. */
  readonly url?: string;
  /** The visible properties (from the resolved view) — the same ones the card and the table use. */
  readonly visible: readonly PropertyId[];
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
  /** When the app archived the file — only for a surface that lists archived files (the Archive). */
  readonly archivedAt?: string;
}

/**
 * An asset as an item of the generic collection list: its name, what the
 * Properties turn on (size, created, last edited) and, in place of an icon, its
 * preview thumbnail (`AssetPreview`, the same one the table shows). The row
 * carries `data-resource-id` (vault files only), which the body's F2-to-rename
 * handler looks up. Drawing the row is `CollectionDataList`'s job.
 */
export function toAssetListItem(
  asset: Asset,
  { url, visible, onClick, titleContent, archivedAt }: AssetListItemOptions
): CollectionDataListItem {
  // The asset's property values: the vault file's own facts; a remote asset has none.
  const { values } = toAssetEntry(asset, archivedAt);

  return {
    id: asset.id,
    // The preview stands where the icon would: the image itself, a PDF's first page, or the kind's icon.
    leading: createElement(CollectionMedia, null, createElement(AssetPreview, { kind: asset.kind, url })),
    title: getResourceDisplayName(asset),
    titleContent,
    // Every visible plain-value property, in canonical order, that this asset has a value for.
    metadata: valueProperties(visible)
      .map((id) => formatPropertyValue(id, values))
      .filter((value): value is string => Boolean(value)),
    onClick: onClick ? () => onClick(asset) : undefined,
    // Only a vault file can be renamed in place, so only it carries the id F2 looks up.
    props: asset.source === 'local' ? { 'data-resource-id': asset.resource.id } : {},
  };
}
