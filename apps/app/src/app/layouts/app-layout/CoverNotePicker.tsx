import { Overlay } from '@components/overlay/Overlay';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { FolderPicker } from '@components/folder-picker/FolderPicker';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import './CoverNotePicker.css';

export interface CoverTarget {
  readonly kind: 'note' | 'folder';
  readonly id: string;
}

interface CoverNotePickerProps {
  readonly open: boolean;
  readonly notes: FolderPickerItem[];
  /** A flat "Folders" section after the notes (each item's own `section` names it). */
  readonly folders?: FolderPickerItem[];
  readonly onSelect: (target: CoverTarget) => void;
  readonly onClose: () => void;
}

/**
 * "Set as cover image" → which note or folder? The existing FolderPicker, fed notes (flat rows
 * with the note icon) and then a flat Folders section, centered over the app. It only reports
 * what was chosen; what that does is the caller's.
 */
export function CoverNotePicker({
  open,
  notes,
  folders = [],
  onSelect,
  onClose,
}: CoverNotePickerProps) {
  const allItems = [...notes, ...folders];
  const folderIds = new Set(folders.map((folder) => folder.id));

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
          items={allItems}
          placeholder="Search notes and folders…"
          leadingIcon="note"
          showPath
          sectionLimit={5}
          onSelect={(item) => onSelect({ kind: folderIds.has(item.id) ? 'folder' : 'note', id: item.id })}
        />
      </div>
    </Overlay>
  );
}
