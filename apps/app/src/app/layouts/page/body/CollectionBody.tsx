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

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionViewMode;
  properties?: CollectionPropertyVisibility;
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
}: CollectionBodyProps) {
  const noteSection =
    viewMode === 'table' ? (
      <NoteTable columns={toTableColumns(properties)}>
        {notes.map((entry) => renderNoteTableRow(entry, properties))}
      </NoteTable>
    ) : (
      <NoteListGrid>{notes.map((entry) => renderNoteListItem(entry, properties))}</NoteListGrid>
    );

  return (
    <PageBody className="collection__content">
      {folders.length > 0 && (
        <FolderGrid>{folders.map((entry) => renderFolderCard(entry))}</FolderGrid>
      )}
      {noteSection}
    </PageBody>
  );
}
