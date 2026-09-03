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
 * **More Actions control** (resource-action enhancement): a `.image-
 * overlay__frame` wraps the `<img>` purely to give the floating control a
 * `position: relative` box to anchor into — the same role
 * `.cm-image-container` plays for the inline widget's own controls
 * (ImageFloatingControls.css). Rendered only when `image.resourceId` is
 * present (never an empty/disabled control for an external URL with no
 * resource behind it), and — unlike the inline widget's hover-reveal
 * control — always visible: no opacity toggle, no `:hover`/`:focus-within`
 * rule, since there is no underlying document to accidentally engage the
 * way CM6's own reveal-on-engagement contract cares about.
 */
export function ImageOverlay({
  image,
  onClose,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
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
          {image.resourceId && (
            <ImageOverlayMoreActions
              resourceId={image.resourceId}
              onArchiveResource={onArchiveResource}
              onRevealResourceInFinder={onRevealResourceInFinder}
              onCopyResourcePath={onCopyResourcePath}
              resourceMoveDestinations={resourceMoveDestinations}
              onMoveResource={onMoveResource}
              onCreateFolder={onCreateFolder}
              onSetCoverImage={onSetCoverImage}
            />
          )}
        </div>
      )}
    </Overlay>
  );
}
