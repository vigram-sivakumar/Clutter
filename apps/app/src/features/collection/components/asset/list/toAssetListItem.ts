import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import type { CollectionDataListItem } from '../../list/CollectionDataList';
import { ASSET_KIND_LABEL } from '../assetKind';

export interface AssetListItemOptions {
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (resource: VaultResource) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as an item of the generic collection list: its icon, name and kind
 * label. The row carries `data-resource-id`, which the body's F2-to-rename
 * handler looks up. Drawing the row is `CollectionDataList`'s job.
 */
export function toAssetListItem(
  resource: VaultResource,
  { onClick, titleContent }: AssetListItemOptions
): CollectionDataListItem {
  return {
    id: resource.id,
    icon: getResourceIcon(resource.kind),
    title: getResourceDisplayName(resource),
    titleContent,
    metadata: [ASSET_KIND_LABEL[resource.kind]],
    onClick: onClick ? () => onClick(resource) : undefined,
    props: { 'data-resource-id': resource.id },
  };
}
