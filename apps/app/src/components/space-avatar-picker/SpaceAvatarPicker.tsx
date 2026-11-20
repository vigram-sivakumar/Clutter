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
  /** Whether an avatar is set; the archive action is only enabled then. */
  hasAvatar: boolean;
  onSelectEmoji: (emoji: string) => void;
  /** An image chosen from the user's computer (an absolute path). */
  onUploadImage: (filePath: string) => void;
  onRemove: () => void;
  /** Label used by the remove action when this picker is reused for another identity icon. */
  entityLabel?: 'avatar' | 'icon';
  /** Where the popover sits along the anchor's bottom edge. Defaults to `center`, as the Space details dialog has it. */
  alignment?: 'start' | 'center' | 'end';
}

/**
 * Shared emoji/image picker for Space avatars and page/folder identity icons. It composes the existing
 * EmojiTray and local-image upload step under two tabs; callers own persistence and fallback behaviour.
 */
export function SpaceAvatarPicker({
  anchorRef,
  open,
  onClose,
  hasAvatar,
  onSelectEmoji,
  onUploadImage,
  onRemove,
  entityLabel = 'avatar',
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
            aria-label={`Remove ${entityLabel}`}
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
