import { useRef } from 'react';
import { Entry } from '@components/entry/Entry';
import { Caret } from '@components/caret/Caret';
import { EditableText } from '@components/editable-text/EditableText';
import { AppIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getPageIcon';

interface NewFolderRowProps {
  level: number;
  onCommit(name: string): void;
  onCancel(): void;
}

/**
 * A transient row representing a folder creation in progress — no backing
 * Folder exists yet, and FolderOperations.create() is never called from
 * here directly. It owns only its own inline-edit UI state; the parent
 * calls create() from onCommit and is responsible for removing this row
 * once the real Folder appears through the Vault's own notification flow.
 *
 * Escape, an empty/whitespace-only commit, or a blur without a commit all
 * end the session without calling onCommit — see onEditingEnd below.
 */
export function NewFolderRow({ level, onCommit, onCancel }: NewFolderRowProps) {
  const committedRef = useRef(false);

  return (
    <Entry
      level={level}
      leading={
        <>
          {/* Placeholder-only, like Note.tsx's non-expandable rows — this
              row can never expand, but every row at this level reserves
              the caret's leading space so icons stay aligned. */}
          <Caret isPlaceholder />
          <AppIcon icon={getPageIcon('folder')} />
        </>
      }
    >
      <EditableText
        value=""
        placeholder="Untitled Folder"
        autoFocus
        onCommit={(name) => {
          const trimmed = name.trim();

          if (trimmed === '') {
            return;
          }

          committedRef.current = true;
          onCommit(trimmed);
        }}
        onEditingEnd={() => {
          if (!committedRef.current) {
            onCancel();
          }
        }}
      />
    </Entry>
  );
}
