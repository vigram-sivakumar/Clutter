import type { ReactNode } from 'react';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { NoteTable } from '@features/collection/components/note/table/NoteTable';
import { NoteTableRow } from '@features/collection/components/note/table/NoteTableRow';
import { NoteListGrid } from '@features/collection/components/note/list/NoteListGrid';
import { NoteList } from '@features/collection/components/note/list/NoteList';
import { FolderGrid } from '@features/collection/components/folder/grid/FolderGrid';
import { FolderCard } from '@features/collection/components/folder/card/FolderCard';

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

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionViewMode;
}

/**
 * Exported so ArchiveCollectionBody can render the same folder rows every
 * other collection page shows, without a second implementation. `actions`,
 * when supplied, reuses FolderCard's hover-gated `actions` slot
 * (CollectionEntry's `actions` prop).
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
 */
export function renderNoteListItem(entry: CollectionEntryModel, actions?: ReactNode) {
  return (
    <NoteList
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      created={entry.created}
      updated={entry.updated}
      onClick={entry.onClick}
      actions={actions}
    />
  );
}

/** Table-mode note rendering — same plain-string title caveat as renderNoteListItem. */
export function renderNoteTableRow(entry: CollectionEntryModel, actions?: ReactNode) {
  return (
    <NoteTableRow
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      created={entry.created}
      updated={entry.updated}
      onClick={entry.onClick}
      actions={actions}
    />
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
  viewMode = 'list',
}: CollectionBodyProps) {
  const noteSection =
    viewMode === 'table' ? (
      <NoteTable>{notes.map((entry) => renderNoteTableRow(entry))}</NoteTable>
    ) : (
      <NoteListGrid>{notes.map((entry) => renderNoteListItem(entry))}</NoteListGrid>
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
