import type { ReactNode } from 'react';

import { CollectionEntry } from '@features/collection/CollectionEntry';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { buildCollectionTableGridTemplateColumns } from '../../table/collectionTableColumns';
import { CollectionTableRow } from '../../table/CollectionTableRow';
import { ASSET_KIND_LABEL } from '../assetKind';
import { ASSET_TABLE_COLUMNS } from './assetTableColumns';

export interface AssetTableRowProps {
  readonly resource: VaultResource;
  readonly onClick?: (resource: VaultResource) => void;
  readonly titleContent?: ReactNode;
}

const GRID_TEMPLATE_COLUMNS = buildCollectionTableGridTemplateColumns(ASSET_TABLE_COLUMNS);

/**
 * An asset as a Table row: the shared `CollectionTableRow` shell with the
 * asset's two cells (name, type) under `ASSET_TABLE_COLUMNS`. No actions
 * overlay — the row opens the asset, whose viewer holds its actions.
 */
export function AssetTableRow({ resource, onClick, titleContent }: AssetTableRowProps) {
  return (
    <CollectionTableRow
      data-resource-id={resource.id}
      gridTemplateColumns={GRID_TEMPLATE_COLUMNS}
      onClick={onClick ? () => onClick(resource) : undefined}
    >
      <CollectionEntry
        className="collection-table-row__entry"
        icon={getResourceIcon(resource.kind)}
        title={getResourceDisplayName(resource)}
        titleContent={titleContent}
      />
      <CollectionEntry
        className="collection-table-row__type"
        metadata={ASSET_KIND_LABEL[resource.kind]}
      />
    </CollectionTableRow>
  );
}
