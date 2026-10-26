import type { VaultResource } from '@core/vault/models/VaultResource';
import type { PropertyId } from '@core/properties/collectionProperties';
import { sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import { ARCHIVE_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import type { CollectionEntryModel, CollectionEntryValues } from '@features/collection/page/CollectionEntryModel';
import { useMarqueeSelection } from '@features/collection/selection/useMarqueeSelection';
import { useCollectionSelection } from '@features/collection/selection/useCollectionSelection';
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
import { useCollectionItemContextMenu, type CollectionItemMenuResolver } from './useCollectionItemContextMenu';
import { useCollectionSelectionMenu } from './useCollectionSelectionMenu';

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
  /**
   * Right-click menu for an archived folder or note: its own menu (Restore, Delete permanently — what the
   * definitions allow an archived item), resolved from the entry that was clicked. Its presence is the capability
   * gate, as in every other collection; absent, entries have no menu.
   */
  itemMenu?: CollectionItemMenuResolver;
  /** Right-click menu for an archived file (Restore, Delete permanently). Same capability gate. */
  resourceMenu?: CollectionItemMenuResolver<VaultResource>;
}

/** An item or row with the context menu's attributes merged into its own `props`. */
function withMenuProps<T extends { props?: object }>(item: T, menuProps: object | undefined): T {
  return menuProps ? { ...item, props: { ...item.props, ...menuProps } } : item;
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
 * them from the same `visible` set as any other. A file's archive date is the one the app recorded when it archived it. Rows carry no inline actions; what can be done to an archived item is in its right-click menu (and
 * its own page or viewer): Restore and Delete permanently, for one item or the whole selection.
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
  itemMenu,
  resourceMenu,
}: ArchiveCollectionBodyProps) {
  // Which rows are checked (never saved; see `useCollectionSelection`), and the menu a right-click opens while any is:
  // composed from each checked item's own menu — a note's, a folder's or a file's.
  const selection = useCollectionSelection([...folders, ...notes].map((entry) => entry.id).concat(resources.map((resource) => resource.id)));
  const menuFor = (id: string) => {
    const entry = [...folders, ...notes].find((candidate) => candidate.id === id);
    if (entry) {
      return itemMenu ? itemMenu(entry) : null;
    }
    const resource = resources.find((candidate) => candidate.id === id);
    return resource && resourceMenu ? resourceMenu(resource) : null;
  };
  const selectionMenu = useCollectionSelectionMenu(selection, menuFor);
  const entryContextMenu = useCollectionItemContextMenu(itemMenu, selectionMenu);
  const resourceContextMenu = useCollectionItemContextMenu<VaultResource>(resourceMenu, selectionMenu);

  const rows: ArchiveRow[] = [
    ...folders.map((entry) => ({
      id: entry.id,
      values: entry.values,
      listItem: withMenuProps(toFolderListItem(entry, { visible }), entryContextMenu.entryProps(entry)),
      tableRow: withMenuProps(toFolderTableRow(entry, { visible }), entryContextMenu.entryProps(entry)),
    })),
    ...notes.map((entry) => ({
      id: entry.id,
      values: entry.values,
      listItem: withMenuProps(toNoteListItem(entry, { visible }), entryContextMenu.entryProps(entry)),
      tableRow: withMenuProps(toNoteTableRow(entry, { visible }), entryContextMenu.entryProps(entry)),
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
        listItem: withMenuProps(toAssetListItem(asset, options), resourceContextMenu.entryProps(resource)),
        tableRow: withMenuProps(toAssetTableRow(asset, options), resourceContextMenu.entryProps(resource)),
      };
    }),
  ];
  const sorted = sortEntries(rows, sort);
  const marquee = useMarqueeSelection(selection);
  const selectionOf = (row: ArchiveRow) => selection.selectionFor(row.id, String(row.values.name));

  return (
    <PageBody className="collection__content" ref={marquee.ref}>
      {rows.length === 0 ? (
        <CollectionEmptyState message={emptyMessage} />
      ) : viewMode === 'table' ? (
        <CollectionDataTable
          columns={buildPropertyTableColumns(visible)}
          rows={sorted.map((row) => ({ ...row.tableRow, selection: selectionOf(row) }))}
        />
      ) : (
        <CollectionDataList items={sorted.map((row) => ({ ...row.listItem, selection: selectionOf(row) }))} />
      )}
      {/* Trailing breathing room below the last row — see
          .collection__bottom-spacer's own comment in
          CollectionBody.css for why it's a real flex child rather
          than padding on .collection__content. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
      {entryContextMenu.overlay}
      {resourceContextMenu.overlay}
      {selectionMenu.overlay}
    </PageBody>
  );
}
