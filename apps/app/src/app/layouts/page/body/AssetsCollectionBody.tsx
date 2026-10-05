import { useState, type KeyboardEvent, type ReactNode } from 'react';

import { PageBody } from './Page.Body';
import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  resolveDefaultProperties,
} from './collectionViewCapabilities';
import {
  type CollectionPropertyVisibility,
  type CollectionSortState,
  type CollectionViewMode,
} from './CollectionBody';
import { EditableText } from '@components/editable-text/EditableText';
import { AppIcon } from '@shared/icon';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import { CollectionGrid } from '@features/collection/components/grid/CollectionGrid';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import { toAssetListItem } from '@features/collection/components/asset/toAssetListItem';
import { toAssetTableRow } from '@features/collection/components/asset/toAssetTableRow';
import { ASSET_TABLE_COLUMNS } from '@features/collection/components/asset/assetTableColumns';
import {
  ASSET_CARD_ASPECT_RATIO,
  ASSET_GRID,
  toAssetCardProps,
} from '@features/collection/components/asset/toAssetCardProps';
import { sortAssets } from '@features/collection/components/asset/sortAssets';
import type { Asset } from '@core/vault/models/Asset';

export interface AssetsCollectionBodyProps {
  /** The collection's assets (`MembershipSelector.getAllAssets`): vault files and the remote images Clutter uses. */
  readonly assets: readonly Asset[];
  /**
   * The collection's selected layout (the standard view-mode control, owned by
   * PageHost): the shared List, Table or Card of asset items.
   */
  readonly viewMode?: CollectionViewMode;
  /** The collection's Properties (the standard control, owned by PageHost) — for Assets, `title`, `size`, `created` and `updated`, in the Card layout. */
  readonly properties?: CollectionPropertyVisibility;
  /**
   * The collection's Sort by (the standard control, owned by PageHost) —
   * Name or Type; the same order in every layout. Absent, the resources keep
   * the order given.
   */
  readonly sort?: CollectionSortState;
  /** `Application.resolveResourceImageUrl` — turns a vault file's path into a loadable URL, for the Card view's previews and the Table's Preview column. A remote asset's own URL is used as is. */
  readonly resolveResourceUrl?: (path: string) => string;
  /**
   * Opens the asset, for every layout alike — the caller routes by source and
   * kind: a vault file to the image overlay or the PDF viewer (where its other
   * actions — archive, move, download, reveal — live), a remote image to the
   * plain image overlay.
   */
  readonly onOpenAsset?: (asset: Asset) => void;
  /**
   * Starts an upload (the collection's Add action). When given, the Card view
   * ends with an "Upload" card that calls it — shown even for an empty collection.
   */
  readonly onUpload?: () => void;
  /**
   * `ResourceOperations.renameResource(resourceId, name)` — a single
   * collision-free write, committed once, so this body feeds it the final
   * name only (no per-keystroke channel). Only a vault file can be renamed; a
   * remote asset has no file to rename.
   */
  readonly onRenameResource: (resourceId: string, name: string) => void;
}

/**
 * The Assets collection's body: the shared List, Table and Card layouts filled
 * with asset items (the asset mappers' list items, table rows and card props). The same
 * items open the same way in every layout, and rename the same way: press F2
 * on a focused item and its name becomes an inline editor. The collection's
 * header controls (Settings, view mode, Add) are not here — they come from the
 * standard collection header actions (PageHost -> CollectionHeaderActions).
 */
export function AssetsCollectionBody({
  assets: unsorted,
  viewMode = 'list',
  properties = resolveDefaultProperties(ASSET_COLLECTION_VIEW_CAPABILITIES),
  sort,
  resolveResourceUrl,
  onOpenAsset,
  onUpload,
  onRenameResource,
}: AssetsCollectionBodyProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // A hidden card title leaves nothing to edit in place, so F2 renames nothing then.
  const titleHidden = viewMode === 'card' && !properties.title;
  const assets = sort ? sortAssets(unsorted, sort) : unsorted;
  // A vault file's preview URL comes from the resolver, a remote asset's is itself.
  const urlFor = (asset: Asset): string | undefined =>
    asset.source === 'remote' ? asset.url : resolveResourceUrl?.(asset.resource.path);

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
  const clickFor = (asset: Asset) =>
    asset.source === 'local' && editingId === asset.resource.id ? undefined : onOpenAsset;

  // The inline rename editor an asset's title becomes: EditableText seeded with the
  // extension-free display name, committing through `ResourceOperations.renameResource`
  // — the same in list rows, table rows and cards.
  const titleContentFor = (asset: Asset): ReactNode =>
    asset.source === 'local' && editingId === asset.resource.id ? (
      <EditableText
        value={getResourceDisplayName(asset.resource)}
        className="editable-text--nowrap"
        autoFocus
        onCommit={(name) => onRenameResource(asset.resource.id, name)}
        onEditingEnd={() => setEditingId(null)}
      />
    ) : undefined;

  let layout: ReactNode;
  if (viewMode === 'card' && resolveResourceUrl) {
    layout = (
      <CollectionGrid columns={ASSET_GRID} onKeyDown={handleKeyDown}>
        {assets.map((asset) => (
          <CollectionCard
            key={asset.id}
            {...toAssetCardProps(asset, {
              url: urlFor(asset),
              showTitle: properties.title,
              metadataVisibility: {
                size: properties.size,
                created: properties.created,
                updated: properties.updated,
              },
              onClick: clickFor(asset),
              titleContent: titleContentFor(asset),
            })}
          />
        ))}
        {onUpload && (
          <CollectionCard isEmpty aspectRatio={ASSET_CARD_ASPECT_RATIO} aria-label="Upload" onClick={onUpload}>
            <AppIcon icon="plus" />
          </CollectionCard>
        )}
      </CollectionGrid>
    );
  } else if (viewMode === 'table') {
    layout = (
      <CollectionDataTable
        columns={ASSET_TABLE_COLUMNS}
        rows={assets.map((asset) =>
          toAssetTableRow(asset, {
            url: urlFor(asset),
            onClick: clickFor(asset),
            titleContent: titleContentFor(asset),
          })
        )}
        onKeyDown={handleKeyDown}
      />
    );
  } else {
    layout = (
      <CollectionDataList
        items={assets.map((asset) =>
          toAssetListItem(asset, {
            url: urlFor(asset),
            onClick: clickFor(asset),
            titleContent: titleContentFor(asset),
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
