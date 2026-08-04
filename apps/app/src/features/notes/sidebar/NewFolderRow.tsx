import { useRef } from 'react';
import { Entry } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { FolderLeading } from './FolderLeading';

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
      // Same leading composition as a real Folder row — an in-progress
      // folder has no children yet, so this matches how an existing,
      // empty Folder renders: the caret occupies its grid cell (kept
      // disabled, no onExpandToggle) rather than a standalone
      // placeholder span, so spacing, hover crossfade, and alignment
      // stay identical to every other folder-shaped row.
      leading={<FolderLeading isEmpty hasCaret />}
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
