import { useRef } from 'react';
import { AppIcon } from '@shared/icon';
import { EditableText } from '@components/editable-text/EditableText';
import { getFolderTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { CollectionGrid } from '@features/collection/components/grid/CollectionGrid';
import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import { FOLDER_GRID, toFolderCardProps } from '@features/collection/components/folder/toFolderCardProps';

/**
 * A folder being created, inline: the page shows a card with a focused, empty name field and creates
 * nothing until the name is committed. Present only while the user is naming the folder.
 */
export interface FolderCreation {
  /** Whether a folder of this name can be made here (false → the field rejects it and stays open). */
  canCreate?(name: string): boolean;
  /** The folder's name, committed: what was typed, or the placeholder when the field was left empty. */
  onCommit(name: string): void;
  /** Escape: no folder is made. */
  onCancel(): void;
}

/**
 * The card a folder takes while it is being named. Same shape as a folder card; its title is the
 * existing inline name editor, empty and focused, with "New folder" as the placeholder only. Enter or
 * leaving the field commits — typed text, else the placeholder text as the name; Escape cancels.
 */
function NewFolderCard({ creation }: { creation: FolderCreation }) {
  const settledRef = useRef(false);
  const cancelledRef = useRef(false);
  const placeholder = getFolderTitlePlaceholder();

  const settle = (name: string) => {
    settledRef.current = true;
    creation.onCommit(name);
  };

  return (
    <CollectionCard
      header={
        <CardTitleSection
          icon="folder"
          titleContent={
            <EditableText
              value=""
              placeholder={placeholder}
              className="editable-text--nowrap"
              autoFocus
              onCommit={(typed) => {
                const name = typed.trim();
                if (name === '') return;
                if (creation.canCreate && !creation.canCreate(name)) return false;
                settle(name);
              }}
              onCancel={() => {
                cancelledRef.current = true;
              }}
              onEditingEnd={() => {
                if (settledRef.current) return;
                if (cancelledRef.current) creation.onCancel();
                else settle(placeholder);
              }}
            />
          }
        />
      }
    />
  );
}

/**
 * The folders section every collection that holds folders draws at the top: one generic card per
 * folder, and — when a folder can be created here — a trailing empty "+" card. (The caller draws it
 * only once there is at least one folder, or a folder is being named: a section offers Create only
 * after it has an item.) While a folder is being named its card takes the "+" card's place.
 */
export function renderFolderGrid(
  entries: readonly CollectionEntryModel[],
  onCreateFolder?: () => void,
  creation?: FolderCreation
) {
  return (
    <CollectionGrid {...FOLDER_GRID}>
      {entries.map((entry) => (
        <CollectionCard key={entry.id} {...toFolderCardProps(entry)} />
      ))}
      {creation ? (
        <NewFolderCard creation={creation} />
      ) : (
        onCreateFolder && (
          <CollectionCard isEmpty aria-label="Create folder" onClick={onCreateFolder}>
            <AppIcon icon="plus" />
          </CollectionCard>
        )
      )}
    </CollectionGrid>
  );
}
