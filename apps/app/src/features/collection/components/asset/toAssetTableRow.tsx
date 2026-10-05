import type { ReactNode } from 'react';

import type { PropertyId } from '@core/properties/collectionProperties';
import { propertyValueCells } from '../../properties/tableColumns';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { Asset } from '@core/vault/models/Asset';

import type { CollectionDataTableRow } from '@features/collection/components/table/CollectionDataTable';
import { CollectionMedia } from '@features/collection/components/media/CollectionMedia';
import { toAssetEntry } from './toAssetEntry';
import { AssetPreview } from './AssetPreview';

export interface AssetTableRowOptions {
  /** The asset's loadable URL (a local file's `Application.resolveResourceImageUrl(path)`, a remote asset's own URL), for the preview column. Absent, the preview shows the kind's icon. */
  readonly url?: string;
  /** The visible properties (from the resolved view) — must be the same ones the table's columns were built from. */
  readonly visible: readonly PropertyId[];
  /** Opens the asset — absent while it is being renamed, so a click in the editor never opens it. */
  readonly onClick?: (asset: Asset) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as a row of the generic collection table: its values only, keyed
 * by the column ids `buildPropertyTableColumns` declares — the name (with the asset's
 * preview, `AssetPreview`, in place of an icon), and, as the Properties turn them on, the file's size and dates (empty for a remote asset, which has no file). A
 * vault file's row carries `data-resource-id`,
 * which the body's F2-to-rename handler looks up. Drawing the cells and the
 * grid is `CollectionDataTable`'s job.
 */
export function toAssetTableRow(
  asset: Asset,
  { url, visible, onClick, titleContent }: AssetTableRowOptions
): CollectionDataTableRow {
  // The asset's property values: the vault file's own facts; a remote asset has none.
  const { values } = toAssetEntry(asset);

  return {
    id: asset.id,
    onClick: onClick ? () => onClick(asset) : undefined,
    // Only a vault file can be renamed in place, so only it carries the id F2 looks up.
    props: asset.source === 'local' ? { 'data-resource-id': asset.resource.id } : {},
    cells: {
      name: {
        variant: 'header',
        // The preview stands where the icon would: the image itself, a PDF's first page, or the kind's icon.
        leading: (
          <CollectionMedia>
            <AssetPreview kind={asset.kind} url={url} />
          </CollectionMedia>
        ),
        title: getResourceDisplayName(asset),
        titleContent,
      },
      ...propertyValueCells(visible, values),
    },
  };
}
