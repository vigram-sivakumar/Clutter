import { useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CollectionGrid } from '@features/collection/components/grid/CollectionGrid';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import { toNoteListItem } from '@features/collection/components/note/toNoteListItem';
import { toNoteTableRow } from '@features/collection/components/note/toNoteTableRow';
import {
  NOTE_CARD_ASPECT_RATIO,
  NOTE_GRID,
  toNoteCardProps,
} from '@features/collection/components/note/toNoteCardProps';
import type { NotePreviewResolvers } from '@features/collection/components/note/notePreviewResolvers';
import { buildPropertyTableColumns } from '@features/collection/properties/tableColumns';
import { CollectionEmptyState } from '@features/collection/components/empty/CollectionEmptyState';
import { CoverPickerOverlay } from '@app/layouts/page/cover/CoverPickerOverlay';
import type { PropertyId } from '@core/properties/collectionProperties';
import { NOTE_SORT_OPTIONS, sortEntries, type CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import { FOLDER_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';
import './CollectionBody.css';

import { CreateCard, createNewItem } from './collectionCreate';
import { renderFolderGrid, type FolderCreation } from './collectionFolders';
import { PageBody } from './Page.Body';

/**
 * Collection-view wiring. Two independent axes, not one:
 *
 *  - View mode ('list' | 'table' | 'card') — how *notes* lay out.
 *  - Item type ('folder' | 'note') — folders always render as cards in their
 *    own grid, regardless of viewMode; only the notes section switches
 *    between the generic CollectionDataList, CollectionDataTable and a grid
 *    of CollectionCards. Folders have no table rows (they carry no table
 *    columns' worth of data), which is why they don't switch with the notes
 *    section. What a note or folder shows is decided by the domain mappers
 *    (toNoteCardProps, toNoteListItem, toNoteTableRow, toFolderCardProps);
 *    drawing it is the generic Collection primitives' job.
 */
/**
 * What a body shows when the page does not say: the ordinary folder collection's resolved
 * defaults — read from its `CollectionDefinition`, not restated here. (The page always passes
 * the resolved view of the collection it is showing.)
 */
const DEFAULT_VIEW = resolveCollectionView(FOLDER_COLLECTION);

export { NOTE_SORT_OPTIONS };

/**
 * What the Cover image thumbnail (the Table's column, the List's media) needs
 * from the host: how to show a
 * note's persisted cover, and the three ways to change it (the same writes the
 * note's own page cover uses, keyed by note id). Its presence is the capability
 * gate — absent, the column isn't offered (the Archive, for one).
 */
export interface NoteCoverActions {
  /** A persisted cover reference → a loadable URL (`Application.resolveCoverImageForDisplay`). */
  resolveUrl(cover: string): string | null;
  /** Link or Unsplash pick. */
  onSet(noteId: string, url: string): void;
  /** Upload: import the file, then set it. */
  onSetFromUpload(noteId: string, sourcePath: string): void;
  /** Clear the cover. */
  onRemove(noteId: string): void;
}

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionLayout;
  /** The visible properties, from the resolved view (`resolveCollectionView`) — canonical order, required ones included. */
  visible?: readonly PropertyId[];
  sort?: CollectionSort;
  /**
   * Present only when this page supports creating a folder here (see
   * PageHost.tsx's own call sites — an ordinary folder or the Workspace-
   * root view; absent everywhere else, e.g. reserved folders and
   * ArchiveCollectionBody's separate rendering). Its presence is what
   * renders the permanent "Create folder" card as the folders grid's
   * last item, and is also what keeps the grid mounted when there are
   * zero folders — every other caller keeps today's exact behavior
   * (no grid at all when folders is empty).
   */
  onCreateFolder?: () => void;
  /** A folder being named inline, drawn as a card in the folders section while it lasts. */
  folderCreation?: FolderCreation;
  /**
   * The collection's one Create handler — what Create DOES is the page's (here: make a note) and
   * the layouts only ever show it as "Create": a trailing row in List and Table, an empty "+" card
   * in Card. Same "presence is the capability gate" convention as onCreateFolder above. A
   * collection with nothing in it shows the empty state instead, with no Create row or card.
   */
  onCreate?: () => void;
  /**
   * What the empty state's call to action says ("Create note"), decided by the page like the handler
   * itself. Without it (or without `onCreate`) an empty collection offers no action.
   */
  emptyCreateLabel?: string;
  /** The one line an empty collection says (the collection definition's `emptyMessage`). */
  emptyMessage?: string;
  /**
   * Whether the notes section is shown at all (default: yes). Off for a page that only holds folders
   * — a Daily Notes year or the Daily Notes root — where an empty notes table would just be noise.
   */
  showNotes?: boolean;
  /**
   * Draws `folders` in the order given, ignoring the Configure menu's sort (default: sorted by it).
   * For a page whose folders have a natural order of their own — Daily Notes' years newest first,
   * a year's months January to December — that a name or date sort would break.
   */
  foldersInGivenOrder?: boolean;
  /**
   * Resolution for Card mode's read-only NotePageCanvas (WikiLink/Tag/
   * embed/image/cover) — composed in PageHost from the editor's own
   * resolver factories. Only consulted when `viewMode === 'card'`.
   */
  previewResolvers?: NotePreviewResolvers;
  /**
   * The Cover image thumbnail — a column in Table mode, the trailing media in
   * List mode: shows each note's cover and opens the cover picker for that note
   * when it is clicked. Absent, it isn't offered. Never consulted in Card mode.
   */
  noteCover?: NoteCoverActions;
}

interface RenderNoteListOptions {
  /**
   * Each note's cover thumbnail at the row's trailing end — present only when
   * the host can change covers (see `NoteCoverActions`); shown while the Cover
   * image property is on. Same shape the table's Cover image column takes.
   */
  coverFor?: (entry: CollectionEntryModel) => {
    url: string | null;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /** The list's trailing Create row's handler; absent, none renders. */
  onCreate?: () => void;
}

/**
 * List-mode note rendering — the notes, as items of the one generic
 * CollectionDataList (the same list assets and the Archive use). Title is
 * passed as a plain string — the list has no markdown-resolving slot, so a
 * note title containing wiki-link/tag markdown syntax renders literally here.
 * A real, existing limitation of the component, not something this wiring
 * introduces.
 *
 * `visible` gates which properties are actually passed through — one that
 * isn't visible is omitted, never a blanked-out but still-fetched value.
 */
function renderNoteList(
  entries: readonly CollectionEntryModel[],
  visible: readonly PropertyId[] = DEFAULT_VIEW.visible,
  { coverFor, onCreate }: RenderNoteListOptions = {}
) {
  return (
    <CollectionDataList
      items={entries.map((entry) =>
        toNoteListItem(entry, {
          visible,
          cover: visible.includes('cover') ? coverFor?.(entry) : undefined,
        })
      )}
      newItem={createNewItem(onCreate)}
    />
  );
}

interface RenderNoteTableOptions {
  /** The Cover image column's per-note cell — present only when the host can change covers (see `NoteCoverActions`). */
  coverFor?: (entry: CollectionEntryModel) => {
    url: string | null;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /** The table's trailing Create row's handler — absent, none renders (the Archive has nothing to create). */
  onCreate?: () => void;
}

/**
 * Table-mode note rendering — the notes, as rows of the one generic
 * CollectionDataTable. Same plain-string title caveat and `visible` gating
 * as renderNoteList: a property that isn't visible removes its column from the
 * header and from every row, not just its values (the Archive's Archived column
 * is simply a visible property only the Archive offers).
 */
function renderNoteTable(
  entries: readonly CollectionEntryModel[],
  visible: readonly PropertyId[] = DEFAULT_VIEW.visible,
  { coverFor, onCreate }: RenderNoteTableOptions = {}
) {
  return (
    <CollectionDataTable
      columns={buildPropertyTableColumns(visible, { cover: coverFor !== undefined })}
      rows={entries.map((entry) =>
        toNoteTableRow(entry, {
          visible,
          cover: coverFor?.(entry),
        })
      )}
      newItem={createNewItem(onCreate)}
    />
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
  viewMode = DEFAULT_VIEW.layout,
  visible = DEFAULT_VIEW.visible,
  sort = DEFAULT_VIEW.sort,
  onCreateFolder,
  folderCreation,
  onCreate,
  emptyCreateLabel,
  emptyMessage,
  showNotes = true,
  foldersInGivenOrder = false,
  previewResolvers,
  noteCover,
}: CollectionBodyProps) {
  const sortedFolders = foldersInGivenOrder ? [...folders] : sortEntries(folders, sort, NOTE_SORT_OPTIONS);
  const sortedNotes = sortEntries(notes, sort, NOTE_SORT_OPTIONS);

  // The note whose cover picker is open, and the thumbnail it opens beside
  // (the picker is a popover anchored to the clicked cell, so the element
  // is kept in a ref rather than state).
  const [coverNoteId, setCoverNoteId] = useState<string | null>(null);
  const coverAnchorRef = useRef<HTMLElement | null>(null);
  const coverNote = coverNoteId ? notes.find((note) => note.id === coverNoteId) : undefined;
  const closeCoverPicker = () => setCoverNoteId(null);

  // Each note's cover thumbnail, for the Table's Cover image column and the
  // List's trailing media alike — one definition, so both behave identically.
  const coverFor = noteCover
    ? (entry: CollectionEntryModel) => ({
        // A hidden cover isn't shown anywhere in the collection (the Card
        // view hides it too), so its note reads as having none here.
        url: entry.values.cover ? noteCover.resolveUrl(entry.values.cover) : null,
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
          coverAnchorRef.current = event.currentTarget;
          setCoverNoteId(entry.id);
        },
      })
    : undefined;

  // A section offers Create only once it has at least one item: the notes' Create row or card is for
  // adding to notes that are there, and an empty section gets nothing (a collection with no items at
  // all gets the empty state and its call to action instead).
  const createInNotes = sortedNotes.length > 0 ? onCreate : undefined;

  const noteSection =
    viewMode === 'table' ? renderNoteTable(sortedNotes, visible, {
      // Only when something can be created here: a Create row that does nothing is a dead control.
      onCreate: createInNotes,
      coverFor,
    }) : viewMode === 'card' ? (
      <CollectionGrid columns={NOTE_GRID}>
        {sortedNotes.map((entry) => (
          <CollectionCard
            key={entry.id}
            {...toNoteCardProps(entry, {
              visible,
              resolvers: previewResolvers,
            })}
          />
        ))}
        {createInNotes && <CreateCard onCreate={createInNotes} aspectRatio={NOTE_CARD_ASPECT_RATIO} />}
      </CollectionGrid>
    ) : renderNoteList(sortedNotes, visible, {
      onCreate: createInNotes,
      coverFor,
    });

  // A collection with nothing in it at all — no folders and no notes (in the sections it draws) —
  // shows the empty state instead of its List, Table or Card: an empty collection offers no Create
  // row or card (the header's Create is the way in).
  const isEmpty = !folderCreation && sortedFolders.length === 0 && (!showNotes || sortedNotes.length === 0);
  const createAction = onCreate && emptyCreateLabel ? { label: emptyCreateLabel, onClick: onCreate } : undefined;

  return (
    <PageBody className="collection__content">
      {isEmpty ? (
        <CollectionEmptyState message={emptyMessage} action={createAction} />
      ) : (
        <>
          {/* The folders' Create card is likewise only for adding to folders that are there. */}
          {(sortedFolders.length > 0 || folderCreation) && renderFolderGrid(sortedFolders, onCreateFolder, folderCreation)}
          {showNotes && noteSection}
        </>
      )}
      {noteCover && viewMode !== 'card' && coverNote && (
        <CoverPickerOverlay
          open
          onClose={closeCoverPicker}
          anchorRef={coverAnchorRef as RefObject<HTMLElement>}
          onSetCoverImage={(url) => noteCover.onSet(coverNote.id, url)}
          onSetCoverImageFromUpload={(sourcePath) => noteCover.onSetFromUpload(coverNote.id, sourcePath)}
          onRemove={() => noteCover.onRemove(coverNote.id)}
        />
      )}
      {/* Trailing breathing room below the last row/card — see this
          class's own comment in CollectionBody.css for why it's a real
          flex child rather than padding on .collection__content. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}
