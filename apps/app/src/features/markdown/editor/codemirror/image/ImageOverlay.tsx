import { Overlay } from '@components/overlay/Overlay';

import './ImageOverlay.css';

export interface ImageOverlayImage {
  readonly url: string;
  readonly alt: string;
}

export interface ImageOverlayProps {
  readonly image: ImageOverlayImage | null;
  readonly onClose: () => void;
}

/**
 * The lightbox opened by clicking a rendered Markdown image (`ImageWidget`,
 * via `imageLivePreview.ts`'s injected click callback — see
 * `MarkdownEditor.tsx`'s own wiring). Deliberately built directly on the
 * project's existing `Overlay` primitive (`components/overlay/Overlay.tsx`)
 * rather than a new overlay system: close-on-Escape, close-on-backdrop-
 * click, centered positioning, and focus restore are all already provided
 * by `Overlay` itself (`useEscape`/`useOverlayFocus`/
 * `useOverlayCenteredPosition`) and reused completely unmodified here —
 * this file adds nothing beyond an image-sized `className` for `Overlay`'s
 * already-unopinionated `.overlay__content` box.
 *
 * `Dialog` (the project's other existing `Overlay` wrapper) was
 * deliberately **not** reused: its fixed `dialog--small/medium/large`
 * widths (240/320/420px, `Dialog.css`) are sized for form/menu-shaped
 * content, not a full-size image lightbox — using `Overlay` directly, with
 * this component's own sizing class, is the smaller and more correct
 * extension than forcing an image into a width class built for something
 * else.
 *
 * Always mounted (even while closed): `Overlay` itself returns `null`
 * when `open` is false, so there's nothing to gate here — matches how
 * `Dialog`/`Confirmation` consumers already use `Overlay` elsewhere.
 */
export function ImageOverlay({ image, onClose }: ImageOverlayProps) {
  return (
    <Overlay position="centered" open={image !== null} onClose={onClose} backdrop="tinted" className="image-overlay">
      {image && <img src={image.url} alt={image.alt} className="image-overlay__img" />}
    </Overlay>
  );
}
