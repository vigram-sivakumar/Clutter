import { useRef } from 'react';
import './collectionFolders.css';
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
 * Whether a folder may be named this. Not allowed: "/" and ":" (macOS: path separator; Finder shows ":" as
 * "/"), the Windows-reserved \ * ? " < > |, the NUL character, and a leading "." (a hidden folder — which
 * also rules out "." and ".."). Checked before the folder's own sibling-collision check.
 */
export function isAllowedFolderName(name: string): boolean {
  return !/[/:\\*?"<>|\0]/.test(name) && !name.startsWith('.');
}

/**
 * The card a folder takes while it is being named. Same shape as a folder card; its title is the
 * existing inline name editor, empty and focused, with the placeholder only ("New Folder"). Enter
 * commits — the typed text, else the placeholder text as the name. Escape or clicking away cancels:
 * no folder is made.
 */
function NewFolderCard({ creation }: { creation: FolderCreation }) {
  const settledRef = useRef(false);
  const enteredRef = useRef(false);
  const typedRef = useRef('');
  const placeholder = getFolderTitlePlaceholder();

  return (
    <CollectionCard
      header={
        <CardTitleSection
          icon="folder"
          titleContent={
            // Only Enter commits, and the editor does not say which key ended a session before its
            // blur callbacks run, so the key is noted on the way in.
            <span className="collection-new-folder__name" onKeyDownCapture={(event) => (enteredRef.current = event.key === 'Enter')}>
              <EditableText
                value=""
                placeholder={placeholder}
                className="editable-text--nowrap"
                autoFocus
                onCommit={(typed) => {
                  const name = typed.trim();
                  if (name !== '' && (!isAllowedFolderName(name) || (creation.canCreate && !creation.canCreate(name)))) {
                    enteredRef.current = false;
                    return false;
                  }
                  typedRef.current = name;
                }}
                onEditingEnd={() => {
                  if (settledRef.current) return;
                  settledRef.current = true;
                  if (enteredRef.current) creation.onCommit(typedRef.current || placeholder);
                  else creation.onCancel();
                }}
              />
            </span>
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
