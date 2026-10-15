import './collectionFolders.css';
import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CollectionGrid } from '@features/collection/components/grid/CollectionGrid';
import { CollectionEntry } from '@features/collection/components/entry/CollectionEntry';
import { FOLDER_GRID, toFolderEntryProps } from '@features/collection/components/folder/toFolderEntryProps';

/**
 * The folders section every collection that holds folders draws at the top: one generic card per
 * folder, and — when a folder can be created here — a trailing empty "+" card that opens the New folder
 * dialog. (The caller draws it only once there is at least one folder: a section offers Create only
 * after it has an item.)
 */
export function renderFolderGrid(
  entries: readonly CollectionEntryModel[],
  onCreateFolder?: () => void,
  /** Extra props per card (the Collection View's drag handlers and markers); absent, none. */
  dragProps?: (entry: CollectionEntryModel) => object | undefined
) {
  return (
    <CollectionGrid {...FOLDER_GRID}>
      {entries.map((entry) => (
        <CollectionEntry key={entry.id} {...toFolderEntryProps(entry)} {...dragProps?.(entry)} />
      ))}
      {onCreateFolder && (
        <CollectionEntry
          layout="cell"
          className="collection-entry--folder-card collection-entry--folder-card-new"
          leading={<AppIcon icon="plus" />}
          title=""
          aria-label="New folder"
          onClick={onCreateFolder}
        />
      )}
    </CollectionGrid>
  );
}
