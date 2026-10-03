import { Overlay } from '@components/overlay/Overlay';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { FolderPicker } from '@components/folder-picker/FolderPicker';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import './CoverNotePicker.css';

interface CoverNotePickerProps {
  readonly open: boolean;
  readonly notes: FolderPickerItem[];
  readonly onSelect: (noteId: string) => void;
  readonly onClose: () => void;
}

/**
 * "Set as cover image" → which note? The existing FolderPicker, fed notes
 * instead of folders (flat rows with the note icon), centered over the app.
 * It only reports the chosen note; what that does is the caller's.
 */
export function CoverNotePicker({
  open,
  notes,
  onSelect,
  onClose,
}: CoverNotePickerProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      position="centered"
      backdrop="tinted"
    >
      <div className="cover-note-picker">
        <span className="cover-note-picker__header">
          Set cover image
          <Button
            isIconOnly
            size="small"
            interaction="subtle"
            aria-label="Dismiss"
            onClick={onClose}
          >
            <AppIcon icon="dismiss" />
          </Button>
        </span>
        <FolderPicker
          items={notes}
          placeholder="Search notes…"
          leadingIcon="note"
          onSelect={(item) => onSelect(item.id)}
        />
      </div>
    </Overlay>
  );
}
