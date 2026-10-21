import { useState } from 'react';
import type { RefObject } from 'react';

import { Button } from '@components/button/Button';
import { EmojiTray } from '@components/emoji-tray/EmojiTray';
import { Popover } from '@components/popover/Popover';
import { Tab, Tabs } from '@components/tabs/Tabs';
import { ImagePickerUpload } from '@app/layouts/page/cover/image-picker/ImagePicker.Upload';
import './SpaceAvatarPicker.css';

type AvatarTab = 'emoji' | 'image';

interface SpaceAvatarPickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  /** Whether an avatar is set; the trash action is only enabled then. */
  hasAvatar: boolean;
  onSelectEmoji: (emoji: string) => void;
  /** An image chosen from the user's computer (an absolute path). */
  onUploadImage: (filePath: string) => void;
  onRemove: () => void;
  /** Where the popover sits along the anchor's bottom edge. Defaults to `center`, as the Space details dialog has it. */
  alignment?: 'start' | 'center' | 'end';
}

/**
 * The space avatar picker: the shared EmojiTray and the cover picker's Upload step under two tabs, in the
 * same Popover every Change icon surface uses. Upload only — a space being created has no vault whose
 * assets could be offered.
 */
export function SpaceAvatarPicker({
  anchorRef,
  open,
  onClose,
  hasAvatar,
  onSelectEmoji,
  onUploadImage,
  onRemove,
  alignment = 'center',
}: SpaceAvatarPickerProps) {
  const [tab, setTab] = useState<AvatarTab>('emoji');

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      side="bottom"
      alignment={alignment}
      size="fit-content"
    >
      <div className="space-avatar-picker">
        <div className="space-avatar-picker__tabs">
          <Tabs
            value={tab}
            variant="flat"
            onValueChange={(next) => setTab(next as AvatarTab)}
          >
            <Tab value="emoji">Emoji</Tab>
            <Tab value="image">Image</Tab>
          </Tabs>
          <Button
            // variant="outline-fill"
            aria-label="Remove avatar"
            disabled={!hasAvatar}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
        {/* Both panels share one grid cell, so the width is the same on either tab while the height hugs
            the active panel (see the CSS); the emoji panel stays mounted to keep its search and scroll. */}
        <div className="space-avatar-picker__panels">
          <div className="space-avatar-picker__panel" hidden={tab !== 'emoji'}>
            <EmojiTray showRemove={false} onSelect={onSelectEmoji} />
          </div>
          <div className="space-avatar-picker__panel" hidden={tab !== 'image'}>
            <ImagePickerUpload onSubmit={onUploadImage} />
          </div>
        </div>
      </div>
    </Popover>
  );
}
