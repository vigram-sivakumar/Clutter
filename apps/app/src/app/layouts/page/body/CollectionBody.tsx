import { useRef, useState, type MouseEvent, type RefObject } from 'react';
import { AppIcon } from '@shared/icon';
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
import { FOLDER_GRID, toFolderCardProps } from '@features/collection/components/folder/toFolderCardProps';
import {
  buildNoteTableColumns,
  type NoteTableColumnVisibility,
} from '@features/collection/components/note/noteTableColumns';
import { CoverPickerOverlay } from '@app/layouts/page/cover/CoverPickerOverlay';
import type { PropertyId } from '@core/properties/collectionProperties';
import { sortEntries, type CollectionSort, type SortOptions } from '@core/properties/collectionSort';
import './CollectionBody.css';

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
export type CollectionViewMode = 'list' | 'table' | 'card';

/**
 * Which note properties the collection UI currently shows — the
 * "Properties" section of the Configure menu (CollectionViewMenu.tsx),
 * distinct from view mode. Folder rows have no equivalent fields today
 * (a folder card shows subfolder/note counts instead), so this only ever
 * gates note rendering.

 */
export interface CollectionPropertyVisibility {
  description: boolean;
  created: boolean;
  updated: boolean;
  /** Archive collection only — ignored (never offered, never rendered) everywhere else. */
  archived: boolean;
  /** Table / List: show the Cover image column / media (when the host can change covers). Ignored by the note Card layout, which always shows the cover. */
  cover: boolean;
  /** No longer offered or read (a note card always shows its content); kept only so previously saved view configs still load unchanged. */
  preview: boolean;
  /** Assets' Card layout only — show each card's title section (icon and name). Ignored everywhere else. */
  title: boolean;
  /** Assets' Card layout only — show each card's file size line. Ignored everywhere else (Created / Last edited reuse `created` / `updated`). */
  size: boolean;
}

export const DEFAULT_COLLECTION_PROPERTY_VISIBILITY: CollectionPropertyVisibility = {
  description: true,
  created: true,
  updated: true,
  archived: true,
  cover: true,
  preview: true,
  title: true,
  size: true,
};

/**
 * The subset of `properties` that maps to the notes table's actual
 * columns — `description` isn't a separate column (it's nested inside
 * the Name column's own cell, alongside the title), so it's excluded
 * here rather than threaded into a column the table doesn't have.
 */
export function toTableColumns(
  properties: CollectionPropertyVisibility,
  showArchived = false,
  /** Whether the host can change a note's cover — without it the Cover image column has nothing to offer, so it isn't shown. */
  canChangeCover = false
): NoteTableColumnVisibility {
  return {
    cover: canChangeCover && properties.cover,
    created: properties.created,
    updated: properties.updated,
    archived: showArchived && properties.archived,
  };
}

/**
 * The Sort by state is `{ property, direction }` (`CollectionSort`, core/properties): a
 * property id from the one registry and the arrow shown. What sorting by a property MEANS is
 * that property's own `sort` behavior, implemented once by `sortEntries` — nothing in this
 * file knows how any property is ordered.
 */
export const DEFAULT_COLLECTION_SORT: CollectionSort = {
  property: 'name',
  direction: 'down',
};

/**
 * How the notes collections break ties: Description and Cover image fall back to Name, every
 * other property keeps its ties in the order given. (The assets collection breaks the ties of
 * its own properties by Name — see `ASSET_SORT_OPTIONS`; the two have always differed and this
 * preserves both.) Folders are ordered with the same options.
 */
export const NOTE_SORT_OPTIONS: SortOptions = {
  nameTieBreak: new Set<PropertyId>(['description', 'cover']),
};

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
  viewMode?: CollectionViewMode;
  properties?: CollectionPropertyVisibility;
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
  /**
   * Wires each view mode's trailing "New Note" row (the table's and the list's `newItem`, or
   * the card grid's empty "+" card) — same "presence is the capability
   * gate" convention as onCreateFolder above. Without it no row is drawn
   * in any mode (a "New Note" row that does nothing is a dead control).
   * With it, table mode renders its row regardless of note count; list
   * mode only gets one when sortedNotes is non-empty (below) — list's own
   * empty state is not this row, so it's withheld rather than forwarded
   * as-is.
   */
  onCreateNote?: () => void;
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

export interface RenderNoteListOptions {
  /**
   * Each note's cover thumbnail at the row's trailing end — present only when
   * the host can change covers (see `NoteCoverActions`); shown while the Cover
   * image property is on. Same shape the table's Cover image column takes.
   */
  coverFor?: (entry: CollectionEntryModel) => {
    url: string | null;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /** The list's trailing "New Note" row's handler; absent, none renders. */
  onCreateNote?: () => void;
}

/**
 * List-mode note rendering — the notes, as items of the one generic
 * CollectionDataList (the same list assets and the Archive use). Title is
 * passed as a plain string — the list has no markdown-resolving slot, so a
 * note title containing wiki-link/tag markdown syntax renders literally here.
 * A real, existing limitation of the component, not something this wiring
 * introduces.
 *
 * `properties` gates which of description/created/updated/archived are
 * actually passed through — unchecked means omitted, never a blanked-out but
 * still-fetched value. Exported so
 * ArchiveCollectionBody renders the same list instead of a second one.
 */
export function renderNoteList(
  entries: readonly CollectionEntryModel[],
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  { coverFor, onCreateNote }: RenderNoteListOptions = {}
) {
  return (
    <CollectionDataList
      items={entries.map((entry) =>
        toNoteListItem(entry, {
          show: {
            description: properties.description,
            created: properties.created,
            updated: properties.updated,
            archived: properties.archived,
          },
          cover: properties.cover ? coverFor?.(entry) : undefined,
        })
      )}
      newItem={onCreateNote ? { label: 'New Note', onClick: onCreateNote } : undefined}
    />
  );
}

export interface RenderNoteTableOptions {
  /** The Cover image column's per-note cell — present only when the host can change covers (see `NoteCoverActions`). */
  coverFor?: (entry: CollectionEntryModel) => {
    url: string | null;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /** Archive collection only — adds the Archived column (and its cells). */
  showArchived?: boolean;
  /** The table's trailing "New Note" row's handler — an ordinary collection's; absent, none renders (the Archive has nothing to create). */
  onCreateNote?: () => void;
}

/**
 * Table-mode note rendering — the notes, as rows of the one generic
 * CollectionDataTable. Same plain-string title caveat and `properties` gating
 * as renderNoteList: an unchecked property removes its column from the
 * header and from every row, not just its values. Exported so
 * ArchiveCollectionBody renders the same table (with its Archived column)
 * instead of a second implementation.
 */
export function renderNoteTable(
  entries: readonly CollectionEntryModel[],
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  { coverFor, showArchived = false, onCreateNote }: RenderNoteTableOptions = {}
) {
  const columns = toTableColumns(properties, showArchived, coverFor !== undefined);

  return (
    <CollectionDataTable
      columns={buildNoteTableColumns(columns)}
      rows={entries.map((entry) =>
        toNoteTableRow(entry, {
          showDescription: properties.description,
          columns,
          cover: coverFor?.(entry),
        })
      )}
      newItem={onCreateNote ? { label: 'New Note', onClick: onCreateNote } : undefined}
    />
  );
}

/**
 * The folders grid: one generic card per folder, and — when a folder can be
 * created here — a trailing empty "+" card. Exported so ArchiveCollectionBody
 * renders the same folder cards every other collection page shows.
 */
export function renderFolderGrid(entries: readonly CollectionEntryModel[], onCreateFolder?: () => void) {
  return (
    <CollectionGrid {...FOLDER_GRID}>
      {entries.map((entry) => (
        <CollectionCard key={entry.id} {...toFolderCardProps(entry)} />
      ))}
      {onCreateFolder && (
        <CollectionCard isEmpty aria-label="Create folder" onClick={onCreateFolder}>
          <AppIcon icon="plus" />
        </CollectionCard>
      )}
    </CollectionGrid>
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
  viewMode = 'table',
  properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  sort = DEFAULT_COLLECTION_SORT,
  onCreateFolder,
  onCreateNote,
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

  const noteSection =
    viewMode === 'table' ? renderNoteTable(sortedNotes, properties, {
      // Only when notes can be created here: a "New Note" row that does nothing is a dead control.
      onCreateNote,
      coverFor,
    }) : viewMode === 'card' ? (
      <CollectionGrid columns={NOTE_GRID}>
        {sortedNotes.map((entry) => (
          <CollectionCard
            key={entry.id}
            {...toNoteCardProps(entry, {
              show: { description: properties.description, updated: properties.updated },
              resolvers: previewResolvers,
            })}
          />
        ))}
        {onCreateNote && sortedNotes.length > 0 && (
          <CollectionCard isEmpty aspectRatio={NOTE_CARD_ASPECT_RATIO} aria-label="New Note" onClick={onCreateNote}>
            <AppIcon icon="plus" />
          </CollectionCard>
        )}
      </CollectionGrid>
    ) : renderNoteList(sortedNotes, properties, {
      onCreateNote: sortedNotes.length > 0 ? onCreateNote : undefined,
      coverFor,
    });

  return (
    <PageBody className="collection__content">
      {(sortedFolders.length > 0 || onCreateFolder) && renderFolderGrid(sortedFolders, onCreateFolder)}
      {showNotes && noteSection}
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
