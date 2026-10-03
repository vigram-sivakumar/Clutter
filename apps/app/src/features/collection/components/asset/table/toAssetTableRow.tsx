import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import type { CollectionDataTableRow } from '../../table/CollectionDataTable';
import { ASSET_KIND_LABEL } from '../assetKind';
import { AssetThumbnail } from './AssetThumbnail';

export interface AssetTableRowOptions {
  /** The resource's loadable URL (`Application.resolveResourceImageUrl(path)`), for the preview column. Absent, the preview shows the kind's icon. */
  readonly url?: string;
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (resource: VaultResource) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as a row of the generic collection table: its values only, keyed
 * by the column ids in `ASSET_TABLE_COLUMNS` — the name, a thumbnail
 * (`AssetThumbnail`) and the kind label. The row carries `data-resource-id`,
 * which the body's F2-to-rename handler looks up. Drawing the cells and the
 * grid is `CollectionDataTable`'s job.
 */
export function toAssetTableRow(
  resource: VaultResource,
  { url, onClick, titleContent }: AssetTableRowOptions
): CollectionDataTableRow {
  return {
    id: resource.id,
    onClick: onClick ? () => onClick(resource) : undefined,
    props: { 'data-resource-id': resource.id },
    cells: {
      name: {
        kind: 'header',
        icon: getResourceIcon(resource.kind),
        title: getResourceDisplayName(resource),
        titleContent,
      },
      preview: {
        kind: 'media',
        children: <AssetThumbnail kind={resource.kind} url={url} />,
      },
      type: { kind: 'text', value: ASSET_KIND_LABEL[resource.kind] },
    },
  };
}
