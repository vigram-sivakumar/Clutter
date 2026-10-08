import { Overlay } from '@components/overlay/Overlay';
import { PickerCard } from '@components/picker-card/PickerCard';
import type { PickerListItem } from '@components/picker-list/PickerList.types';

interface RestoreDestinationPickerProps {
  readonly open: boolean;
  /** The folders it can be restored into — the Move destination list, so its root (the vault root, or a zone's root) leads. */
  readonly items: PickerListItem[];
  /** The chosen row's id; the caller maps its root row to where "the root" is for that kind of item. */
  readonly onSelect: (destinationId: string) => void;
  readonly onClose: () => void;
}

/**
 * "Restore to…" for something put in `Archive/` from outside Clutter: it has no recorded original location,
 * and Clutter does not invent one, so the user chooses. The existing PickerCard fed the existing Move
 * destination list, centered over the app. It only reports what was chosen; restoring is the caller's.
 */
export function RestoreDestinationPicker({ open, items, onSelect, onClose }: RestoreDestinationPickerProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      position="centered"
      top={Math.round(window.innerHeight * 0.2)}
      backdrop="tinted"
    >
      <PickerCard
        title="Restore to…"
        onClose={onClose}
        items={items}
        placeholder="Search folders…"
        leadingIcon="folder"
        sectionLimit={8}
        onSelect={(item) => onSelect(item.id)}
      />
    </Overlay>
  );
}
