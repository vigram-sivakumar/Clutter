import type { VaultResource } from '@core/vault/models/VaultResource';
import type { ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';

/**
 * The single "which resource overlay is open" state shape, owned by
 * `AppLayout` — the one shared owner for every overlay entry point
 * (Sidebar, Assets, Archive, Markdown image/PDF embeds) instead of the
 * three independent owners this replaced (Sidebar, PageHost,
 * MarkdownEditor). A single discriminated union instead of two independent
 * `useState`s means a click can never leave both overlays' backing state
 * simultaneously non-null.
 *
 * `image` is pre-resolved to an `ImageOverlayImage` at the point the state
 * is set (exactly as every existing ImageOverlay call site already does);
 * `onSetCoverImage`, when present, is supplied only by the Markdown
 * editor's own image-click entry point (`openImageOverlay` in
 * `AppLayout.tsx`) — "set as cover" only makes sense for an image clicked
 * inside the currently-open page's own content, never for a Sidebar/Assets/
 * Archive resource click, which may not even relate to the active page.
 *
 * `pdf` carries the raw `VaultResource` and lets `PdfOverlay` resolve its
 * own loadable URL, since a PDF has no `alt`/`copyUrl`-shaped payload the
 * way an image does. `actionsEnabled` is `false` only for an
 * already-archived resource's overlay (`openVaultResourceOverlay(resource,
 * { archived: true })`): unlike `ImageOverlay`, whose More Actions control
 * is self-gated on `image.resourceId` being present, `PdfOverlay`/
 * `PdfViewerMoreActions` always renders its "More actions" button off
 * `resource.id` (never optional) — so this flag is what the archived case
 * needs to omit those actions instead.
 */
export type ResourceOverlayState =
  | {
      readonly kind: 'image';
      readonly image: ImageOverlayImage;
      readonly onSetCoverImage?: () => void;
      /**
       * `false` for an image shown without any action on it (opened from an archived note, or from the
       * Archive): the overlay then offers neither the vault-file menu nor the URL menu a resource-less
       * image would otherwise get. Absent means actions are offered, as before.
       */
      readonly actionsEnabled?: boolean;
    }
  | {
      readonly kind: 'pdf';
      readonly resource: VaultResource;
      readonly actionsEnabled: boolean;
      /** The file is archived (opened from the Archive): its viewer offers Restore and Delete only. */
      readonly archived?: boolean;
    }
  | null;
