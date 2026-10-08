import type { VaultResource } from '@core/vault/models/VaultResource';
import type { PropertyId } from '@core/properties/collectionProperties';
import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import { ARCHIVE_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import type { CollectionEntryModel, CollectionEntryValues } from '@features/collection/page/CollectionEntryModel';
import { CollectionDataList, type CollectionDataListItem } from '@features/collection/components/list/CollectionDataList';
import {
  CollectionDataTable,
  type CollectionDataTableRow,
} from '@features/collection/components/table/CollectionDataTable';
import { CollectionEmptyState } from '@features/collection/components/empty/CollectionEmptyState';
import { toFolderListItem, toFolderTableRow } from '@features/collection/components/folder/toFolderListItem';
import { toNoteListItem } from '@features/collection/components/note/toNoteListItem';
import { toNoteTableRow } from '@features/collection/components/note/toNoteTableRow';
import { assetOfResource, toAssetEntry } from '@features/collection/components/asset/toAssetEntry';
import { toAssetListItem } from '@features/collection/components/asset/toAssetListItem';
import { toAssetTableRow } from '@features/collection/components/asset/toAssetTableRow';
import { buildPropertyTableColumns } from '@features/collection/properties/tableColumns';

import { PageBody } from './Page.Body';

export interface ArchiveCollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  /** The archived vault files (images, PDFs). */
  resources: readonly VaultResource[];
  /** The one line shown when nothing is archived (the Archive definition's `emptyMessage`). */
  emptyMessage?: string;
  /** List or Table — the Archive has no Card; the page passes its resolved layout. */
  viewMode?: CollectionLayout;
  /** The visible properties, from the resolved view — the Archive's own. */
  visible?: readonly PropertyId[];
  sort?: CollectionSort;
  /**
   * When each archived file was archived, by its path in the Archive — from the archive record. A file
   * with no entry (archived before the date was recorded, or moved in outside the app) has no date.
   */
  archivedAtByPath?: ReadonlyMap<string, string>;
  /** A vault file's path → a loadable URL, for its thumbnail. */
  resolveResourceUrl?: (path: string) => string;
  /** Opens an archived file (its viewer, where its Restore / Delete live). */
  onOpenResource?(resource: VaultResource): void;
}

/** What the body shows when the page does not say: the Archive's resolved defaults, read from its definition. */
const DEFAULT_VIEW = resolveCollectionView(ARCHIVE_COLLECTION);

/**
 * One archived thing as a row, whatever it is: the values its domain adapter produced (what the
 * one sort engine orders by), and how to draw it as an item of the
 * generic List or a row of the generic Table. A local type of this body — not a universal item.
 */
interface ArchiveRow {
  readonly id: string;
  readonly values: CollectionEntryValues;
  readonly listItem: CollectionDataListItem;
  readonly tableRow: CollectionDataTableRow;
}

/**
 * The page body of the Archive: ONE unified collection of everything archived — folders, notes and
 * files — drawn by the same generic List or Table every other collection uses, sorted together by
 * the one sort engine (never grouped folders → notes → files). Each kind enters through its domain
 * mapper; the generic components only place what they are given. Type (Note, Folder, Image,
 * PDF) and Archived are ordinary properties the Archive's definition offers, so List and Table draw
 * them from the same `visible` set as any other. A file's archive date is the one the app recorded when it archived it. Rows carry no inline actions: a folder or note is restored or deleted from its own page, a file
 * from its viewer.
 */
export function ArchiveCollectionBody({
  folders = [],
  notes = [],
  resources,
  emptyMessage,
  viewMode = DEFAULT_VIEW.layout,
  visible = DEFAULT_VIEW.visible,
  sort = DEFAULT_VIEW.sort,
  archivedAtByPath,
  resolveResourceUrl,
  onOpenResource,
}: ArchiveCollectionBodyProps) {
  const rows: ArchiveRow[] = [
    ...folders.map((entry) => ({
      id: entry.id,
      values: entry.values,
      listItem: toFolderListItem(entry, { visible }),
      tableRow: toFolderTableRow(entry, { visible }),
    })),
    ...notes.map((entry) => ({
      id: entry.id,
      values: entry.values,
      listItem: toNoteListItem(entry, { visible }),
      tableRow: toNoteTableRow(entry, { visible }),
    })),
    ...resources.map((resource) => {
      const asset = assetOfResource(resource);
      const archivedAt = archivedAtByPath?.get(resource.path);
      const options = {
        url: resolveResourceUrl?.(resource.path),
        visible,
        archivedAt,
        onClick: onOpenResource ? () => onOpenResource(resource) : undefined,
      };

      return {
        id: resource.id,
        values: toAssetEntry(asset, archivedAt).values,
        listItem: toAssetListItem(asset, options),
        tableRow: toAssetTableRow(asset, options),
      };
    }),
  ];
  const sorted = sortEntries(rows, sort);

  return (
    <PageBody className="collection__content">
      {rows.length === 0 ? (
        <CollectionEmptyState message={emptyMessage} />
      ) : viewMode === 'table' ? (
        <CollectionDataTable
          columns={buildPropertyTableColumns(visible)}
          rows={sorted.map((row) => row.tableRow)}
        />
      ) : (
        <CollectionDataList items={sorted.map((row) => row.listItem)} />
      )}
      {/* Trailing breathing room below the last row — see
          .collection__bottom-spacer's own comment in
          CollectionBody.css for why it's a real flex child rather
          than padding on .collection__content. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}
