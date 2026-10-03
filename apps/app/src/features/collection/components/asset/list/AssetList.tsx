import type { ReactNode } from 'react';

import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { CollectionListRow } from '../../list/CollectionListRow';
import { ASSET_KIND_LABEL } from '../assetKind';

export interface AssetListProps {
  readonly resource: VaultResource;
  /** Opens the asset (the same handler for rows, table rows and cards). Absent while renaming, so clicks in the editor don't open it. */
  readonly onClick?: (resource: VaultResource) => void;
  /** The inline rename editor, while renaming. */
  readonly titleContent?: ReactNode;
}

/**
 * An asset as a List row: the shared `CollectionListRow` (the same row notes
 * use) with the asset's icon, name and kind. No actions menu — the asset's
 * actions live in its viewer; the row opens it.
 */
export function AssetList({ resource, onClick, titleContent }: AssetListProps) {
  return (
    <CollectionListRow
      data-resource-id={resource.id}
      icon={getResourceIcon(resource.kind)}
      title={getResourceDisplayName(resource)}
      titleContent={titleContent}
      metadata={<span>{ASSET_KIND_LABEL[resource.kind]}</span>}
      onClick={onClick ? () => onClick(resource) : undefined}
    />
  );
}
