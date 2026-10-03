import { useState, type KeyboardEvent, type ReactNode } from 'react';

import { PageBody } from './Page.Body';
import {
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  type CollectionPropertyVisibility,
  type CollectionSortState,
  type CollectionViewMode,
} from './CollectionBody';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import { CollectionCardGrid } from '@features/collection/components/card/CollectionCardGrid';
import { toAssetListItem } from '@features/collection/components/asset/list/toAssetListItem';
import { toAssetTableRow } from '@features/collection/components/asset/table/toAssetTableRow';
import { ASSET_TABLE_COLUMNS } from '@features/collection/components/asset/table/assetTableColumns';
import { AssetCard } from '@features/collection/components/asset/card/AssetCard';
import { AssetRenameField } from '@features/collection/components/asset/AssetRenameField';
import { sortAssets } from '@features/collection/components/asset/sortAssets';
import type { VaultResource } from '@core/vault/models/VaultResource';

export interface AssetsCollectionBodyProps {
  readonly resources: readonly VaultResource[];
  /**
   * The collection's selected layout (the standard view-mode control, owned by
   * PageHost): the shared List, Table or Card of asset items.
   */
  readonly viewMode?: CollectionViewMode;
  /** The collection's Properties (the standard control, owned by PageHost) — for Assets, only `title`, in the Card layout. */
  readonly properties?: CollectionPropertyVisibility;
  /**
   * The collection's Sort by (the standard control, owned by PageHost) —
   * Name or Type; the same order in every layout. Absent, the resources keep
   * the order given.
   */
  readonly sort?: CollectionSortState;
  /** `Application.resolveResourceImageUrl` — turns a resource's path into a loadable URL, for the Card view's previews and the Table's Preview column. */
  readonly resolveResourceUrl?: (path: string) => string;
  /**
   * Opens the asset, for every layout alike — the caller routes by kind: the
   * image overlay for an image, the PDF viewer for a PDF (and an asset's other
   * actions — archive, move, download, reveal — live in those viewers).
   */
  readonly onOpenResource?: (resource: VaultResource) => void;
  /**
   * `ResourceOperations.renameResource(resourceId, name)` — a single
   * collision-free write, committed once, so this body feeds it the final
   * name only (no per-keystroke channel).
   */
  readonly onRenameResource: (resourceId: string, name: string) => void;
}

/**
 * The Assets collection's body: the shared List, Table and Card layouts filled
 * with asset items (the generic data list's and data table's asset rows, and
 * `AssetCard`). The same
 * items open the same way in every layout, and rename the same way: press F2
 * on a focused item and its name becomes an inline editor. The collection's
 * header controls (Settings, view mode, Add) are not here — they come from the
 * standard collection header actions (PageHost -> CollectionHeaderActions).
 */
export function AssetsCollectionBody({
  resources: unsorted,
  viewMode = 'list',
  properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  sort,
  resolveResourceUrl,
  onOpenResource,
  onRenameResource,
}: AssetsCollectionBodyProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // A hidden card title leaves nothing to edit in place, so F2 renames nothing then.
  const titleHidden = viewMode === 'card' && !properties.title;
  const resources = sort ? sortAssets(unsorted, sort) : unsorted;

  // F2 on a focused item renames it — the items carry `data-resource-id`, so one
  // handler on the layout container serves every layout. (A double-click would
  // collide with the single click that opens the asset.)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'F2' || editingId !== null || titleHidden) {
      return;
    }
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-resource-id]');
    if (item?.dataset.resourceId) {
      event.preventDefault();
      setEditingId(item.dataset.resourceId);
    }
  };

  // While an item is renaming, clicks (in the editor) must not open it.
  const clickFor = (resource: VaultResource) =>
    editingId === resource.id ? undefined : onOpenResource;

  const titleContentFor = (resource: VaultResource): ReactNode =>
    editingId === resource.id ? (
      <AssetRenameField
        resource={resource}
        onCommit={(name) => onRenameResource(resource.id, name)}
        onEditingEnd={() => setEditingId(null)}
      />
    ) : undefined;

  let layout: ReactNode;
  if (viewMode === 'card' && resolveResourceUrl) {
    layout = (
      <CollectionCardGrid onKeyDown={handleKeyDown}>
        {resources.map((resource) => (
          <AssetCard
            key={resource.id}
            resource={resource}
            url={resolveResourceUrl(resource.path)}
            showTitle={properties.title}
            onClick={clickFor(resource)}
            titleContent={titleContentFor(resource)}
          />
        ))}
      </CollectionCardGrid>
    );
  } else if (viewMode === 'table') {
    layout = (
      <CollectionDataTable
        columns={ASSET_TABLE_COLUMNS}
        rows={resources.map((resource) =>
          toAssetTableRow(resource, {
            url: resolveResourceUrl?.(resource.path),
            onClick: clickFor(resource),
            titleContent: titleContentFor(resource),
          })
        )}
        onKeyDown={handleKeyDown}
      />
    );
  } else {
    layout = (
      <CollectionDataList
        items={resources.map((resource) =>
          toAssetListItem(resource, {
            url: resolveResourceUrl?.(resource.path),
            onClick: clickFor(resource),
            titleContent: titleContentFor(resource),
          })
        )}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <PageBody className="collection__content">
      {layout}
      {/* Trailing breathing room below the last item — same spacer CollectionBody ends with. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}
