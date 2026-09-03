import { useEffect, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Dialog } from '@components/dialog/Dialog';
import { Input } from '@components/input/Input';
import { VaultPath } from '@core/vault/ingest/VaultPath';

import './RenameResourceDialog.css';

export interface RenameResourceDialogProps {
  /** The resource's current filename (with extension) — same convention as Resource.tsx's inline rename field: only the extension-free stem is editable. */
  currentName: string;
  onCommit(name: string): void;
  onCancel(): void;
}

/**
 * The Image/PDF Resource Page's rename affordance — a Dialog-hosted text
 * prompt, not the inline EditableText every other resource row uses,
 * since this page has no title field to switch into edit mode (per the
 * "no page title" requirement). ResourceOperations.renameResource() never
 * rejects a collision (MoveService's own auto-suffix behavior handles
 * that, see Resource.tsx), so this dialog does no validation of its own —
 * it only collects the new stem and hands it to the caller.
 */
export function RenameResourceDialog({
  currentName,
  onCommit,
  onCancel,
}: RenameResourceDialogProps) {
  const [value, setValue] = useState(VaultPath.stemName(currentName));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = value.trim();

    if (trimmed !== '') {
      onCommit(trimmed);
    }
  }

  return (
    <Dialog open onClose={onCancel} size="small">
      <form className="rename-resource-dialog" onSubmit={handleSubmit}>
        <div className="rename-resource-dialog__header">Rename</div>
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="rename-resource-dialog__actions">
          <Button variant="outlined" size="large" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="filled" size="large" type="submit">
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
