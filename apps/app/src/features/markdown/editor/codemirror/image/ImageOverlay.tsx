import { createPortal } from 'react-dom';

import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { Overlay } from '@components/overlay/Overlay';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

import { ImageOverlayMoreActions } from './ImageOverlayMoreActions';

import './ImageOverlay.css';

export interface ImageOverlayImage {
  readonly url: string;
  readonly alt: string;
  /**
   * Present only when this image resolved to a local `VaultResource` (see
   * `MarkdownEditor.tsx`'s own `onImageClickRef`/`resolveImageResource`) —
   * `undefined` for anything else (an external URL, most commonly), which
   * is exactly what gates the More Actions control below: no resource, no
   * button, never an empty/disabled one.
   */
  readonly resourceId?: string;
  /**
   * The vault-relative path, for a Resource embed only (mirrors
   * `ImageWidget.ts`'s own `copyUrl` field exactly) — carried through so
   * "Set as cover image" can use the same `copyUrl ?? url` rule the inline
   * `ImageOptionsMenu`'s identical action already uses
   * (`MarkdownEditor.tsx`'s `handleSetCoverImage`), rather than a second
   * rule for the same decision.
   */
  readonly copyUrl?: string;
}

export interface ImageOverlayProps {
  readonly image: ImageOverlayImage | null;
  readonly onClose: () => void;
  /**
   * Forwarded straight through to `ImageOverlayMoreActions` — see
   * `MarkdownEditorProps`'s own matching props for the full doc comment on
   * why these are plain callbacks rather than a `ResourceOperations`/
   * `Vault` import here.
   */
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  /** Same shape/reasoning as onRevealResourceInFinder above — see downloadResource.ts. */
  readonly onDownloadResource?: (resourceId: string) => void;
  readonly resourceMoveDestinations?: FolderPickerItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  readonly onCreateFolder?: (name: string) => Promise<string>;
  /**
   * "Set as cover image" — capability-gated exactly like `MarkdownEditor`'s
   * own `onSetCoverImage` (absent omits the item entirely). Zero-arg: the
   * caller (`MarkdownEditor.tsx`'s `handleSetCoverImageFromOverlay`)
   * already has `image.copyUrl ?? image.url` in hand by the time this is
   * wired up, the same way `handleSetCoverImage` does for the inline
   * `ImageOptionsMenu`'s identical item — this stays a plain trigger, not a
   * second place that decides which URL to use.
   */
  readonly onSetCoverImage?: () => void;
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
 *
 * **More Actions control** (resource-action enhancement): positioned at the
 * *overlay's own* top-right corner — the viewport-fixed `.overlay` box
 * `Overlay` itself renders — never the image/frame's own top-right corner,
 * which would otherwise move with the image's own dimensions/aspect ratio
 * (a tall/narrow image would put the button close to a narrow edge, a wide
 * image somewhere else entirely). `.image-overlay__frame` is `position:
 * relative` but is deliberately *not* this control's containing block: it
 * shrink-wraps to the image's own natural size (`useOverlayCenteredPosition`
 * measures exactly that box to center it), and `Overlay.css`'s
 * `.overlay__content--animated` rule leaves a permanent, non-`none`
 * `transform` applied after its entrance animation completes (confirmed
 * directly — `animation-fill-mode` defaults to `forwards`-equivalent
 * retention of the final keyframe's `transform: translate(0, 0) scale(1)`,
 * which computes to `matrix(1, 0, 0, 1, 0, 0)`, not the keyword `none`),
 * which per the CSS spec makes `.overlay__content` a containing block for
 * any `position: fixed` descendant — so a plain `position: fixed` button
 * left inside `.image-overlay__frame` would still track the image-sized
 * box, not the true viewport, exactly the bug this fixes. Portaling
 * straight to `document.body` (sibling to `Overlay`'s own portal, not
 * nested inside it) is what actually escapes that containing block — its
 * own `.image-overlay__controls-viewport` wrapper mirrors `Overlay.css`'s
 * `.overlay` box exactly (`position: fixed; inset: 0`), so the button's
 * `top`/`right` are always relative to the real screen corner, regardless
 * of image size, aspect ratio, or viewport size. `Overlay`'s own submenu/
 * move-destination-picker positioning (inside `ImageOverlayMoreActions`)
 * is unaffected by this move — both already anchor via `anchorRef`'s real
 * measured `getBoundingClientRect()`, never DOM nesting.
 *
 * Rendered only when `image.resourceId` is present (never an empty/
 * disabled control for an external URL with no resource behind it), and —
 * unlike the inline widget's hover-reveal control — always visible: no
 * opacity toggle, no `:hover`/`:focus-within` rule, since there is no
 * underlying document to accidentally engage the way CM6's own
 * reveal-on-engagement contract cares about.
 */
export function ImageOverlay({
  image,
  onClose,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  onDownloadResource,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
  onSetCoverImage,
}: ImageOverlayProps) {
  return (
    <Overlay
      position="centered"
      scrim="strong"
      open={image !== null}
      onClose={onClose}
      backdrop="tinted"
      className="image-overlay"
    >
      {image && (
        <div className="image-overlay__frame">
          <img
            src={image.url}
            alt={image.alt}
            className="image-overlay__img"
          />
        </div>
      )}
      {image &&
        image.resourceId &&
        createPortal(
          <div className="image-overlay__controls-viewport">
            <ImageOverlayMoreActions
              resourceId={image.resourceId}
              onArchiveResource={onArchiveResource}
              onRevealResourceInFinder={onRevealResourceInFinder}
              onCopyResourcePath={onCopyResourcePath}
              onDownloadResource={onDownloadResource}
              resourceMoveDestinations={resourceMoveDestinations}
              onMoveResource={onMoveResource}
              onCreateFolder={onCreateFolder}
              onSetCoverImage={onSetCoverImage}
            />
          </div>,
          document.body
        )}
    </Overlay>
  );
}
