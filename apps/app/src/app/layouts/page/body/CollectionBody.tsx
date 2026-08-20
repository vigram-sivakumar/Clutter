import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { renderCompactMarkdown, type CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';

import { PageBody } from './Page.Body';

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
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

function renderEntry(entry: CollectionEntryModel, resolvers: CompactMarkdownResolvers) {
  return (
    <Entry
      key={entry.id}
      leading={<AppIcon icon={entry.icon} emoji={entry.emoji} />}
      selected={entry.selected}
      onClick={entry.onClick}
    >
      {renderCompactMarkdown(entry.title, resolvers)}
    </Entry>
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
  resolveWikiLink,
  resolveTag,
}: CollectionBodyProps) {
  const resolvers: CompactMarkdownResolvers = { resolveWikiLink, resolveTag };

  return (
    <PageBody className="collection__content">
      {folders.map((entry) => renderEntry(entry, resolvers))}
      {notes.map((entry) => renderEntry(entry, resolvers))}
    </PageBody>
  );
}
