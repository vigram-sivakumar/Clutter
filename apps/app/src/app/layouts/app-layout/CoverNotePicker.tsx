import { Overlay } from '@components/overlay/Overlay';
import { PickerCard } from '@components/picker-card/PickerCard';
import type { PickerListItem } from '@components/picker-list/PickerList.types';

export interface CoverTarget {
  readonly kind: 'note' | 'folder';
  readonly id: string;
}

interface CoverNotePickerProps {
  readonly open: boolean;
  readonly notes: PickerListItem[];
  /** A flat "Folders" section after the notes (each item's own `section` names it). */
  readonly folders?: PickerListItem[];
  readonly onSelect: (target: CoverTarget) => void;
  readonly onClose: () => void;
}

/**
 * "Set as cover image" → which note or folder? The existing PickerList, fed notes (flat rows
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
      // Anchored a fixed distance from the top rather than centered: the card's height follows its
      // results, and a centered card would move its search box up and down as they change.
      top={Math.round(window.innerHeight * 0.2)}
      backdrop="tinted"
    >
      <PickerCard
        title="Set cover image"
        onClose={onClose}
        items={allItems}
        placeholder="Search notes and folders…"
        leadingIcon="note"
        sectionLimit={5}
        onSelect={(item) => onSelect({ kind: folderIds.has(item.id) ? 'folder' : 'note', id: item.id })}
      />
    </Overlay>
  );
}
