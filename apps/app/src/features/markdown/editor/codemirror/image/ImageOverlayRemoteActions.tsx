import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';

export interface ImageOverlayRemoteActionsProps {
  /** Saves a copy of the image at this URL wherever the user chooses (`downloadRemoteImage.ts`, the same fetch-and-Save-dialog the inline image menu uses for an external image). */
  onDownload: () => void;
}

/**
 * The remote counterpart of `ImageOverlayMoreActions`: the floating three-dot
 * control for an image that has no vault file behind it (a remote asset, an
 * external URL in a note). Almost nothing in the resource menu applies to a
 * URL — Archive, Move, Reveal and Copy path all act on a file — so this is its
 * own short menu:
 *
 * - **Set as cover image** — listed, but disabled: it does nothing yet, and a
 *   live control must never be a silent no-op, so it is shown as unavailable
 *   rather than omitted (the caller will wire it later).
 * - **Download** — saves a copy anywhere.
 *
 * Same trigger and positioning (`.image-overlay__control`) as the resource
 * menu, and the same `OverflowMenuBody` behavior.
 */
export function ImageOverlayRemoteActions({ onDownload }: ImageOverlayRemoteActionsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);

  const items: OverflowMenuItemConfig[] = [
    { id: 'set-as-cover-image', label: 'Set as cover image', icon: 'image', disabled: true },
    { id: 'download', label: 'Download', icon: 'download' },
  ];

  return (
    <div className="image-overlay__control">
      <Button
        className="image-overlay__control-button"
        ref={triggerRef}
        size="small"
        variant="ghost"
        interaction="subtle"
        isIconOnly
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <AppIcon icon="moreHorizontal" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        side="bottom"
        alignment="end"
      >
        <OverflowMenuBody
          items={items}
          onSelect={(id) => {
            if (id === 'download') {
              onDownload();
            }
          }}
          onOpenChange={setOpen}
          suppressReturnFocusRef={suppressReturnFocusRef}
        />
      </Overlay>
    </div>
  );
}
