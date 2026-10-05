import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { Asset } from '@core/vault/models/Asset';

import type { CollectionDataTableRow } from '@features/collection/components/table/CollectionDataTable';
import { ASSET_KIND_LABEL } from './assetKind';
import { AssetPreview } from './AssetPreview';

export interface AssetTableRowOptions {
  /** The asset's loadable URL (a local file's `Application.resolveResourceImageUrl(path)`, a remote asset's own URL), for the preview column. Absent, the preview shows the kind's icon. */
  readonly url?: string;
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as a row of the generic collection table: its values only, keyed
 * by the column ids in `ASSET_TABLE_COLUMNS` — the name, a thumbnail
 * (`AssetPreview`), the kind label and where it lives (Vault / Remote). A
 * vault file's row carries `data-resource-id`,
 * which the body's F2-to-rename handler looks up. Drawing the cells and the
 * grid is `CollectionDataTable`'s job.
 */
export function toAssetTableRow(
  asset: Asset,
  { url, onClick, titleContent }: AssetTableRowOptions
): CollectionDataTableRow {
  return {
    id: asset.id,
    onClick: onClick ? () => onClick(asset) : undefined,
    // Only a vault file can be renamed in place, so only it carries the id F2 looks up.
    props: asset.source === 'local' ? { 'data-resource-id': asset.resource.id } : {},
    cells: {
      name: {
        variant: 'header',
        icon: getResourceIcon(asset.kind),
        title: getResourceDisplayName(asset),
        titleContent,
      },
      preview: {
        variant: 'media',
        children: <AssetPreview kind={asset.kind} url={url} />,
      },
      type: { variant: 'text', value: ASSET_KIND_LABEL[asset.kind] },
      source: { variant: 'text', value: asset.source === 'local' ? 'Vault' : 'Remote' },
    },
  };
}
