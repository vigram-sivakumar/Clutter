import { useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import {
  NoteTableNewRow,
  toNoteTableRow,
} from '@features/collection/components/note/table/noteTableRows';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { toNoteListItem } from '@features/collection/components/note/list/noteListItems';
import { NoteCardGrid } from '@features/collection/components/note/card/NoteCardGrid';
import { NoteCard } from '@features/collection/components/note/card/NoteCard';
import type { DocumentPreviewResolvers } from '@features/collection/components/note/card/DocumentPreview';
import { FolderGrid } from '@features/collection/components/folder/grid/FolderGrid';
import { FolderCard } from '@features/collection/components/folder/card/FolderCard';
import {
  buildNoteTableColumns,
  type NoteTableColumnVisibility,
} from '@features/collection/components/note/table/noteTableColumns';
import { CoverPickerOverlay } from '@app/layouts/page/cover/CoverPickerOverlay';
import './CollectionBody.css';

import { PageBody } from './Page.Body';

/**
 * Collection-view wiring. Two independent axes, not one:
 *
 *  - View mode ('list' | 'table' | 'card') — how *notes* lay out.
 *  - Item type ('folder' | 'note') — folders always render as FolderGrid/
 *    FolderCard, regardless of viewMode; only the notes section switches
 *    between the generic CollectionDataList and CollectionDataTable.
 *    FolderCard is an item renderer (a CollectionEntry row with a
 *    background/radius/shadow treatment), and FolderGrid is its matching
 *    container — not "the Card/Grid collection view" (a separate, not-yet-built feature
 *    this wiring doesn't touch). Folders have no table rows yet (the
 *    table's header cell could draw one, but folders carry no table
 *    columns' worth of data), which is why they don't switch with the
 *    notes section.
 */
export type CollectionViewMode = 'list' | 'table' | 'card';

/**
 * Which note properties the collection UI currently shows — the
 * "Properties" section of the Configure menu (CollectionViewMenu.tsx),
 * distinct from view mode. Folder rows have no equivalent fields today
 * (FolderCard shows subfolder/note counts instead), so this only ever
 * gates note rendering.

 */
export interface CollectionPropertyVisibility {
  description: boolean;
  created: boolean;
  updated: boolean;
  /** Archive collection only — ignored (never offered, never rendered) everywhere else. */
  archived: boolean;
  /** Card: show the note's cover image at the top of its preview. Table / List: show the Cover image column / media (when the host can change covers). */
  cover: boolean;
  /** Card layout only — show the rendered note content in its preview. Ignored in List/Table. */
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
 * "Sort by" — the Configure menu's third section. `key` picks which field
 * to order by; `direction` is deliberately `'down' | 'up'`, not
 * `'asc' | 'desc'` — it names the arrow shown, not an abstract ordering,
 * because what "down" *means* differs per key (Name: A→Z; the three date
 * keys: newest-first) per the product spec. `sortCollectionEntries` below
 * is the one place that translates `direction` into an actual comparison
 * for each key.
 */
export type CollectionSortKey = 'name' | 'type' | 'created' | 'updated' | 'archived';
export type CollectionSortDirection = 'down' | 'up';

export interface CollectionSortState {
  key: CollectionSortKey;
  direction: CollectionSortDirection;
}

export const DEFAULT_COLLECTION_SORT: CollectionSortState = {
  key: 'name',
  direction: 'down',
};

/**
 * `direction` is applied here, inside the date comparison, rather than by
 * negating this function's result at the call site — the missing-value
 * sentinel (always-last) must stay direction-independent, and a blanket
 * negation of the whole return value would flip that sentinel along with
 * the real comparison, putting a dateless entry first under 'down'.
 */
function compareRawDates(
  a: string | undefined,
  b: string | undefined,
  direction: CollectionSortDirection
): number {
  // A missing date always sorts after a present one, regardless of
  // direction — never presented as older or newer than a real date.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const cmp = a < b ? -1 : a > b ? 1 : 0;
  // "down" = newest first, i.e. the *larger* ISO timestamp sorts first —
  // the reverse of this function's own ascending (a < b) comparison.
  return direction === 'down' ? -cmp : cmp;
}

/**
 * Sorts a copy of `entries` (never mutates the input — callers hold
 * `readonly` arrays) by `sort`. A folder
 * entry has no `createdAt`/`updatedAt` either (`FolderMetadata` doesn't
 * track them), so sorting folders by a date key is the same honest no-op.
 */
export function sortCollectionEntries(
  entries: readonly CollectionEntryModel[],
  sort: CollectionSortState
): CollectionEntryModel[] {
  const copy = [...entries];

  copy.sort((a, b) => {
    if (sort.key === 'name') {
      const cmp = a.title.localeCompare(b.title);
      return sort.direction === 'down' ? cmp : -cmp;
    }

    const field =
      sort.key === 'created' ? 'createdAt' : sort.key === 'archived' ? 'archivedAt' : 'updatedAt';
    return compareRawDates(a[field], b[field], sort.direction);
  });

  return copy;
}

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
  sort?: CollectionSortState;
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
   * Wires each view mode's trailing "New Note" row (see NoteTableNewRow's
   * and the notes list's `newItem`) — same "presence is the capability
   * gate" convention as onCreateFolder above. Table mode always renders
   * its row regardless of note count; list mode only gets one when
   * sortedNotes is non-empty (below) — list's own empty state is not
   * this row, so it's withheld rather than forwarded as-is.
   */
  onCreateNote?: () => void;
  /**
   * Resolution for Card mode's read-only DocumentPreview (WikiLink/Tag/
   * embed/image/cover) — composed in PageHost from the editor's own
   * resolver factories. Only consulted when `viewMode === 'card'`.
   */
  previewResolvers?: DocumentPreviewResolvers;
  /**
   * The Cover image thumbnail — a column in Table mode, the trailing media in
   * List mode: shows each note's cover and opens the cover picker for that note
   * when it is clicked. Absent, it isn't offered. Never consulted in Card mode.
   */
  noteCover?: NoteCoverActions;
}

/**
 * Exported so ArchiveCollectionBody can render the same folder rows every
 * other collection page shows, without a second implementation. `actions`,
 * when supplied, reuses FolderCard's hover-gated `actions` slot
 * (CollectionEntry's `actions` prop). Folder rows have no
 * CollectionPropertyVisibility-gated fields — see this file's own doc
 * comment on that type.
 */
export function renderFolderCard(entry: CollectionEntryModel, actions?: ReactNode) {
  return (
    <FolderCard
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      subfolderCount={entry.subfolderCount}
      noteCount={entry.noteCount}
      isSelected={entry.selected}
      onClick={entry.onClick}
      actions={actions}
    />
  );
}

/**
 * The permanent "Create folder" grid card — always the last item in the
 * folders grid (CollectionBody appends it after every real FolderCard).
 * Reuses FolderCard itself (icon="plus", title "New folder", no counts so its
 * metadata row never renders — see FolderCard's own doc comments) rather than a
 * second card component; `folder-card--create` is the one thing that
 * distinguishes it, so it can be styled independently without
 * touching every other FolderCard.
 */
function renderCreateFolderCard(onCreateFolder: () => void) {
  return (
    <FolderCard
      key="create-folder"
      icon="plus"
      title="New folder"
      className="folder-card--create"
      aria-label="Create folder"
      onClick={onCreateFolder}
    />
  );
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
  /** Hover-revealed trailing actions per note (Archive's Restore / Delete). */
  actionsFor?: (entry: CollectionEntryModel) => ReactNode;
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
  { coverFor, actionsFor, onCreateNote }: RenderNoteListOptions = {}
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
          actions: actionsFor?.(entry),
          cover: properties.cover ? coverFor?.(entry) : undefined,
        })
      )}
      newItem={onCreateNote ? { label: 'New Note', onClick: onCreateNote } : undefined}
    />
  );
}

/**
 * Card-mode note rendering — same plain-string title caveat and
 * `properties` gating as renderNoteList for the edited date (a card
 * shows no created date — the menu doesn't offer it in Card
 * mode), the description (one line above it, hidden when the note has none —
 * no "No description" placeholder, unlike Table), plus the card-only Cover
 * image / Content preview toggles.
 */
export function renderNoteCard(
  entry: CollectionEntryModel,
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  previewResolvers?: DocumentPreviewResolvers
) {
  return (
    <NoteCard
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      description={properties.description ? entry.description : undefined}
      updated={properties.updated ? entry.updated : undefined}
      markdown={properties.preview ? entry.markdown : ''}
      cover={properties.cover ? entry.cover : undefined}
      showCover={properties.cover}
      showContent={properties.preview}
      coverHidden={entry.coverHidden}
      coverPositionAbove={entry.coverPositionAbove}
      previewResolvers={previewResolvers}
      onClick={entry.onClick}
    />
  );
}

export interface RenderNoteTableOptions {
  /** The Cover image column's per-note cell — present only when the host can change covers (see `NoteCoverActions`). */
  coverFor?: (entry: CollectionEntryModel) => {
    url: string | null;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
  /** Hover-revealed trailing actions per note (Archive's Restore / Delete). */
  actionsFor?: (entry: CollectionEntryModel) => ReactNode;
  /** Archive collection only — adds the Archived column (and its cells). */
  showArchived?: boolean;
  /** The table's trailing row — an ordinary collection's "New Note"; absent, none renders (the Archive has nothing to create). */
  footer?: ReactNode;
}

/**
 * Table-mode note rendering — the notes, as rows of the one generic
 * CollectionDataTable. Same plain-string title caveat and `properties` gating
 * as renderNoteList: an unchecked property removes its column from the
 * header and from every row, not just its values. Exported so
 * ArchiveCollectionBody renders the same table (with its Archived column and
 * row actions) instead of a second implementation.
 */
export function renderNoteTable(
  entries: readonly CollectionEntryModel[],
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  { coverFor, actionsFor, showArchived = false, footer }: RenderNoteTableOptions = {}
) {
  const columns = toTableColumns(properties, showArchived, coverFor !== undefined);

  return (
    <CollectionDataTable
      columns={buildNoteTableColumns(columns)}
      rows={entries.map((entry) =>
        toNoteTableRow(entry, {
          showDescription: properties.description,
          columns,
          actions: actionsFor?.(entry),
          cover: coverFor?.(entry),
        })
      )}
      footer={footer}
    />
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
  previewResolvers,
  noteCover,
}: CollectionBodyProps) {
  const sortedFolders = sortCollectionEntries(folders, sort);
  const sortedNotes = sortCollectionEntries(notes, sort);

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
        url: entry.cover && !entry.coverHidden ? noteCover.resolveUrl(entry.cover) : null,
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
          coverAnchorRef.current = event.currentTarget;
          setCoverNoteId(entry.id);
        },
      })
    : undefined;

  const noteSection =
    viewMode === 'table' ? renderNoteTable(sortedNotes, properties, {
      footer: <NoteTableNewRow onClick={onCreateNote} />,
      coverFor,
    }) : viewMode === 'card' ? (
      <NoteCardGrid
        onCreateNote={sortedNotes.length > 0 ? onCreateNote : undefined}
        headerLines={(properties.description ? 1 : 0) + (properties.updated ? 1 : 0)}
      >
        {sortedNotes.map((entry) =>
          renderNoteCard(entry, properties, previewResolvers)
        )}
      </NoteCardGrid>
    ) : renderNoteList(sortedNotes, properties, {
      onCreateNote: sortedNotes.length > 0 ? onCreateNote : undefined,
      coverFor,
    });

  return (
    <PageBody className="collection__content">
      {(sortedFolders.length > 0 || onCreateFolder) && (
        <FolderGrid>
          {sortedFolders.map((entry) => renderFolderCard(entry))}
          {onCreateFolder && renderCreateFolderCard(onCreateFolder)}
        </FolderGrid>
      )}
      {noteSection}
      {noteCover && viewMode !== 'card' && coverNote && (
        <CoverPickerOverlay
          open
          onClose={closeCoverPicker}
          anchorRef={coverAnchorRef as RefObject<HTMLElement>}
          onSetCoverImage={(url) => noteCover.onSet(coverNote.id, url)}
          onSetCoverImageFromUpload={(sourcePath) => noteCover.onSetFromUpload(coverNote.id, sourcePath)}
        />
      )}
      {/* Trailing breathing room below the last row/card — see this
          class's own comment in CollectionBody.css for why it's a real
          flex child rather than padding on .collection__content. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}
