import type { ReactNode } from 'react';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { NoteTable } from '@features/collection/components/note/table/NoteTable';
import { NoteTableRow } from '@features/collection/components/note/table/NoteTableRow';
import { NoteListGrid } from '@features/collection/components/note/list/NoteListGrid';
import { NoteList } from '@features/collection/components/note/list/NoteList';
import { FolderGrid } from '@features/collection/components/folder/grid/FolderGrid';
import { FolderCard } from '@features/collection/components/folder/card/FolderCard';
import type { NoteTableColumnVisibility } from '@features/collection/components/note/table/noteTableColumns';
import './CollectionBody.css';

import { PageBody } from './Page.Body';

/**
 * Collection-view wiring. Two independent axes, not one:
 *
 *  - View mode ('list' | 'table') — how *notes* lay out.
 *  - Item type ('folder' | 'note') — folders always render as FolderGrid/
 *    FolderCard, regardless of viewMode; only the notes section switches
 *    between NoteListGrid/NoteList and NoteTable/NoteTableRow. FolderCard is
 *    an item renderer (a CollectionEntry row with a background/radius/
 *    shadow treatment), and FolderGrid is its matching container — the same
 *    relationship NoteListGrid has to NoteList and NoteTable has to
 *    NoteTableRow, not "the Card/Grid collection view" (a separate,
 *    not-yet-built feature this wiring doesn't touch). There is no
 *    folder-specific table-row component, and FolderCard's row shape has no
 *    equivalent to NoteTableRow's `--collection-table-column` grid, so it
 *    can't sit under NoteTable's header without breaking column alignment —
 *    which is why folders don't switch with the notes section.
 */
export type CollectionViewMode = 'list' | 'table';

/**
 * Which note properties the collection UI currently shows — the
 * "Properties" section of the Configure menu (CollectionViewMenu.tsx),
 * distinct from view mode. Folder rows have no equivalent fields today
 * (FolderCard shows subfolder/note counts instead), so this only ever
 * gates note rendering.
 *
 * `lastOpened` is included because the Configure menu offers it as a
 * real, toggleable option, but `CollectionEntryModel` has no `lastOpened`
 * field — there is still no data source for it anywhere in the domain
 * model (see the collection-view investigation). Toggling it here changes
 * nothing observable yet; it's wired honestly rather than either omitted
 * (the menu is specified to offer exactly these four) or backed by a
 * fabricated value.
 */
export interface CollectionPropertyVisibility {
  description: boolean;
  lastOpened: boolean;
  created: boolean;
  updated: boolean;
}

export const DEFAULT_COLLECTION_PROPERTY_VISIBILITY: CollectionPropertyVisibility = {
  description: true,
  lastOpened: true,
  created: true,
  updated: true,
};

/**
 * The subset of `properties` that maps to NoteTable's actual grid
 * columns — `description` isn't a separate column (it's nested inside
 * the Name column's own cell, alongside the title), so it's excluded
 * here rather than threaded into a column NoteTable doesn't have.
 */
export function toTableColumns(properties: CollectionPropertyVisibility): NoteTableColumnVisibility {
  return {
    lastOpened: properties.lastOpened,
    created: properties.created,
    updated: properties.updated,
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
export type CollectionSortKey = 'name' | 'lastOpened' | 'created' | 'updated';
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
 * `readonly` arrays) by `sort`. `lastOpened` has no backing field on
 * `CollectionEntryModel` (no data source exists — see that type's own
 * doc comment), so sorting by it is a stable no-op: entries keep their
 * current relative order rather than a fabricated comparison. A folder
 * entry has no `createdAt`/`updatedAt` either (`FolderMetadata` doesn't
 * track them), so sorting folders by a date key is the same honest no-op.
 */
export function sortCollectionEntries(
  entries: readonly CollectionEntryModel[],
  sort: CollectionSortState
): CollectionEntryModel[] {
  const copy = [...entries];

  if (sort.key === 'lastOpened') {
    return copy;
  }

  copy.sort((a, b) => {
    if (sort.key === 'name') {
      const cmp = a.title.localeCompare(b.title);
      return sort.direction === 'down' ? cmp : -cmp;
    }

    const field = sort.key === 'created' ? 'createdAt' : 'updatedAt';
    return compareRawDates(a[field], b[field], sort.direction);
  });

  return copy;
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
   * Wires each view mode's trailing "New Note" row (see NoteTable's and
   * NoteListGrid's own doc comments) — same "presence is the capability
   * gate" convention as onCreateFolder above. Table mode always renders
   * its row regardless of note count; list mode only gets one when
   * sortedNotes is non-empty (below) — list's own empty state is not
   * this row, so it's withheld rather than forwarded as-is.
   */
  onCreateNote?: () => void;
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
 * Reuses FolderCard itself (icon="plus", no title so its metadata row
 * never renders — see FolderCard's own doc comments) rather than a
 * second card component; `folder-card--create` is the one thing that
 * distinguishes it, so its width can be tuned independently later without
 * touching every other FolderCard.
 */
function renderCreateFolderCard(onCreateFolder: () => void) {
  return (
    <FolderCard
      key="create-folder"
      icon="plus"
      className="folder-card--create"
      aria-label="Create folder"
      onClick={onCreateFolder}
    />
  );
}

/**
 * List-mode note rendering. Title is passed as a plain string — NoteList
 * has no markdown-resolving slot the way the old Entry-based renderer's
 * `children` was, so a note title containing wiki-link/tag markdown syntax
 * renders literally here. A real, existing limitation of the component,
 * not something this wiring introduces.
 *
 * `properties` gates which of description/created/updated are actually
 * passed through — unchecked means omitted, never a blanked-out but
 * still-fetched value. `lastOpened` is never passed regardless (no data
 * source — see CollectionPropertyVisibility's own doc comment).
 */
export function renderNoteListItem(
  entry: CollectionEntryModel,
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  actions?: ReactNode
) {
  return (
    <NoteList
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      description={properties.description ? entry.description : undefined}
      created={properties.created ? entry.created : undefined}
      updated={properties.updated ? entry.updated : undefined}
      onClick={entry.onClick}
      actions={actions}
    />
  );
}

/** Table-mode note rendering — same plain-string title caveat and `properties` gating as renderNoteListItem. */
export function renderNoteTableRow(
  entry: CollectionEntryModel,
  properties: CollectionPropertyVisibility = DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  actions?: ReactNode
) {
  return (
    <NoteTableRow
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      description={entry.description}
      showDescription={properties.description}
      created={properties.created ? entry.created : undefined}
      updated={properties.updated ? entry.updated : undefined}
      columns={toTableColumns(properties)}
      onClick={entry.onClick}
      actions={actions}
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
}: CollectionBodyProps) {
  const sortedFolders = sortCollectionEntries(folders, sort);
  const sortedNotes = sortCollectionEntries(notes, sort);

  const noteSection =
    viewMode === 'table' ? (
      <NoteTable columns={toTableColumns(properties)} onCreateNote={onCreateNote}>
        {sortedNotes.map((entry) => renderNoteTableRow(entry, properties))}
      </NoteTable>
    ) : (
      <NoteListGrid
        onCreateNote={sortedNotes.length > 0 ? onCreateNote : undefined}
      >
        {sortedNotes.map((entry) => renderNoteListItem(entry, properties))}
      </NoteListGrid>
    );

  return (
    <PageBody className="collection__content">
      {(sortedFolders.length > 0 || onCreateFolder) && (
        <FolderGrid>
          {sortedFolders.map((entry) => renderFolderCard(entry))}
          {onCreateFolder && renderCreateFolderCard(onCreateFolder)}
        </FolderGrid>
      )}
      {noteSection}
      {/* Trailing breathing room below the last row/card — see this
          class's own comment in CollectionBody.css for why it's a real
          flex child rather than padding on .collection__content. */}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}
