import type { RefObject } from 'react';

import { EmojiTray } from '@components/emoji-tray/EmojiTray';
import { Popover } from '@components/popover/Popover';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';

export interface ChangeIconPickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  hasIcon: boolean;
  onSelect: (emoji: string) => void;
  onRemove: () => void;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
}

/**
 * The one Change icon surface — Popover + EmojiTray, shared by every
 * sidebar note/folder row so the flow has exactly one implementation.
 */
export function ChangeIconPicker({
  anchorRef,
  open,
  onClose,
  hasIcon,
  onSelect,
  onRemove,
  side,
  alignment,
}: ChangeIconPickerProps) {
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} side={side} alignment={alignment}>
      <EmojiTray hasIcon={hasIcon} onSelect={onSelect} onRemove={onRemove} />
    </Popover>
  );
}
