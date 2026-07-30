import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import { PageBody } from './Page.Body';

export interface CollectionBodyProps {
  folders?: readonly CollectionEntryModel[];
  notes?: readonly CollectionEntryModel[];
}

function renderEntry(entry: CollectionEntryModel) {
  return (
    <Entry
      key={entry.id}
      leading={<AppIcon icon={entry.icon} emoji={entry.emoji} />}
      selected={entry.selected}
      onClick={entry.onClick}
    >
      {entry.title}
    </Entry>
  );
}

export function CollectionBody({
  folders = [],
  notes = [],
}: CollectionBodyProps) {
  return (
    <PageBody>
      {folders.map(renderEntry)}
      {notes.map(renderEntry)}
    </PageBody>
  );
}
