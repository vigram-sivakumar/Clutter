import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CollectionGrid } from '@features/collection/components/grid/CollectionGrid';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import { FOLDER_GRID, toFolderCardProps } from '@features/collection/components/folder/toFolderCardProps';

/**
 * The folders section every collection that holds folders draws at the top: one generic card per
 * folder, and — when a folder can be created here — a trailing empty "+" card. (The caller draws it
 * only once there is at least one folder: a section offers Create only after it has an item.)
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
