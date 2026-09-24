import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { renderCompactMarkdown, type CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';
import { NoteTable } from '@features/collection/components/note/table/NoteTable';
import { NoteTableRow } from '@features/collection/components/note/table/NoteTableRow';
import { NoteListGrid } from '@features/collection/components/note/list/NoteListGrid';
import { NoteList } from '@features/collection/components/note/list/NoteList';
import { FolderGrid } from '@features/collection/components/folder/grid/FolderGrid';
import { FolderCard } from '@features/collection/components/folder/card/FolderCard';

import { PageBody } from './Page.Body';

/**
 * Phase 1 collection-view wiring — 'list' (the existing `Entry` rendering,
 * unchanged, and the default) plus the two existing-but-previously-unwired
 * components, 'table' (NoteTable/NoteTableRow + FolderCard) and 'cards'
 * (NoteListGrid/NoteList + FolderGrid/FolderCard). Not persisted yet — the
 * caller (PageHost) owns this as local render state for now.
 */
export type CollectionViewMode = 'list' | 'table' | 'cards';

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
  viewMode?: CollectionViewMode;
  /**
   * Same injected resolution boundary the page editor uses — see Note's
   * own prop doc comment. A note entry's title is markdown-bearing
   * (getPageDisplayLabel's description/content fallbacks, same source
   * FolderTree/DailyNotesList/FavoriteList use); a folder entry's title
   * is a plain name, so renderCompactMarkdown on it is a harmless no-op —
   * one render path for both, not a type-specific branch.
   */
  resolveWikiLink?: CompactMarkdownResolvers['resolveWikiLink'];
  resolveTag?: CompactMarkdownResolvers['resolveTag'];
}

/**
 * Exported (not a private CollectionBody-only helper) so ArchiveCollectionBody
 * can render the same folder/note rows Archive already correctly shows,
 * without a second implementation — one rendering per entry shape, the same
 * rule this file already applies to folders vs. notes themselves.
 *
 * `actions`, when supplied, reuses Entry's existing hover-gated `actions`
 * slot (the same slot Resource.tsx's `archiveActions`/Folder.tsx's "+"
 * button already use) — omitted (the default) renders exactly the same
 * plain row every existing CollectionBody caller already gets, unchanged.
 */
export function renderEntry(
  entry: CollectionEntryModel,
  resolvers: CompactMarkdownResolvers,
  actions?: React.ReactNode
) {
  return (
    <Entry
      key={entry.id}
      leading={<AppIcon icon={entry.icon} emoji={entry.emoji} />}
      selected={entry.selected}
      onClick={entry.onClick}
      actions={actions}
    >
      {renderCompactMarkdown(entry.title, resolvers)}
    </Entry>
  );
}

/**
 * Table/Cards-mode folder rendering — `FolderCard` is the only non-`Entry`
 * folder renderer that exists (there is no "FolderTable" row shape), so
 * both non-list modes use it, wrapped in `FolderGrid` for its layout. Title
 * is passed as a plain string (`FolderCard`'s `title` prop isn't a
 * markdown-resolving slot the way `Entry`'s children are), so a folder
 * name containing wiki-link/tag markdown syntax renders literally here —
 * unlike List mode, and a real, existing limitation of the component, not
 * something this wiring introduces.
 */
function renderFolderCard(entry: CollectionEntryModel) {
  return (
    <FolderCard
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      subfolderCount={entry.subfolderCount}
      noteCount={entry.noteCount}
      isSelected={entry.selected}
      onClick={entry.onClick}
    />
  );
}

/** Table-mode note rendering — same plain-string title caveat as renderFolderCard. */
function renderNoteTableRow(entry: CollectionEntryModel) {
  return (
    <NoteTableRow
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      created={entry.created}
      updated={entry.updated}
      onClick={entry.onClick}
    />
  );
}

/** Cards-mode note rendering — same plain-string title caveat as renderFolderCard. */
function renderNoteListItem(entry: CollectionEntryModel) {
  return (
    <NoteList
      key={entry.id}
      title={entry.title}
      emoji={entry.emoji ?? undefined}
      isSelected={entry.selected}
      created={entry.created}
      updated={entry.updated}
      onClick={entry.onClick}
    />
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
  viewMode = 'list',
  resolveWikiLink,
  resolveTag,
}: CollectionBodyProps) {
  const resolvers: CompactMarkdownResolvers = { resolveWikiLink, resolveTag };

  if (viewMode === 'table') {
    return (
      <PageBody className="collection__content">
        {folders.length > 0 && <FolderGrid>{folders.map(renderFolderCard)}</FolderGrid>}
        <NoteTable>{notes.map(renderNoteTableRow)}</NoteTable>
      </PageBody>
    );
  }

  if (viewMode === 'cards') {
    return (
      <PageBody className="collection__content">
        {folders.length > 0 && <FolderGrid>{folders.map(renderFolderCard)}</FolderGrid>}
        <NoteListGrid>{notes.map(renderNoteListItem)}</NoteListGrid>
      </PageBody>
    );
  }

  return (
    <PageBody className="collection__content">
      {folders.map((entry) => renderEntry(entry, resolvers))}
      {notes.map((entry) => renderEntry(entry, resolvers))}
    </PageBody>
  );
}
