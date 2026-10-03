import type { RefObject } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { ImagePicker } from './image-picker/ImagePicker';
import './CoverPickerOverlay.css';

export interface CoverPickerOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The element the picker opens beside (the cover thumbnail that was clicked). */
  readonly anchorRef: RefObject<HTMLElement>;
  /** A link or Unsplash pick: sets the cover to this URL. */
  readonly onSetCoverImage: (url: string) => void;
  /** An upload: imports the file and sets it as the cover. */
  readonly onSetCoverImageFromUpload: (sourcePath: string) => void;
  /** The picker's Remove button: clears the cover. */
  readonly onRemove: () => void;
}

/**
 * The existing cover `ImagePicker` (Upload / Link / Unsplash, plus remove),
 * opened as a popover beside a thumbnail instead of from the page's own cover
 * or header menu — so a collection can change a note's cover in place. The
 * picker itself is reused unmodified; this only gives it a host (opening to the
 * left of the thumbnail, vertically centered on it) and wires its
 * three sources and remove to one handler each. Like the page cover's picker,
 * Upload and Link close it after a pick, while Unsplash stays open so the user
 * can keep browsing.
 */
export function CoverPickerOverlay({
  open,
  onClose,
  anchorRef,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  onRemove,
}: CoverPickerOverlayProps) {
  return (
    <Overlay open={open} onClose={onClose} anchorRef={anchorRef} side="left" alignment="center">
      <div className="cover-picker-overlay">
        <ImagePicker
          onClose={onClose}
          onRemove={() => {
            onClose();
            onRemove();
          }}
          onLinkSubmit={(url) => {
            onClose();
            onSetCoverImage(url);
          }}
          onUploadSubmit={(sourcePath) => {
            onClose();
            onSetCoverImageFromUpload(sourcePath);
          }}
          onAssetSelect={(cover) => {
            onClose();
            onSetCoverImage(cover);
          }}
          onUnsplashSelect={onSetCoverImage}
        />
      </div>
    </Overlay>
  );
}
