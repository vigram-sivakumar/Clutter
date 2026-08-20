import { useRef } from 'react';
import { Entry } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { getFolderTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';
import { FolderLeading } from './FolderLeading';

interface NewFolderRowProps {
  level: number;
  onCommit(name: string): void | boolean;
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
 *
 * `onCommit` may return `false` (e.g. a duplicate sibling name —
 * Sidebar.Notes' handleCommitNewFolder pre-checks via
 * FolderOperations.canCreate()) — propagated straight through so
 * EditableText's own rejected-commit behavior (stay open, shake, caret at
 * end, typed value preserved) handles it, same as Note/Folder rename.
 * committedRef only flips for an actually-accepted commit, so a rejected
 * Enter correctly leaves the row still "in progress" rather than
 * cancelling it once the field eventually blurs away.
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
        placeholder={getFolderTitlePlaceholder()}
        autoFocus
        onCommit={(name) => {
          const trimmed = name.trim();

          if (trimmed === '') {
            return;
          }

          const result = onCommit(trimmed);

          if (result === false) {
            return false;
          }

          committedRef.current = true;
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
