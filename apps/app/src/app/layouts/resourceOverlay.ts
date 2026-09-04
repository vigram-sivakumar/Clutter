import type { VaultResource } from '@core/vault/models/VaultResource';
import type { ImageOverlayImage } from '@features/markdown/editor/codemirror/image/ImageOverlay';

/**
 * One shared "which resource overlay is open" state shape for a mount site
 * that opens either ImageOverlay or PdfOverlay from the same click flow
 * (Sidebar.tsx, PageHost.tsx) — a single discriminated union instead of two
 * independent `useState`s, so a click can never leave both overlays'
 * backing state simultaneously non-null. `image` is pre-resolved to an
 * `ImageOverlayImage` at the point the state is set (exactly as every
 * existing ImageOverlay call site already does); `pdf` carries the raw
 * `VaultResource` and lets `PdfOverlay` resolve its own loadable URL, since
 * a PDF has no `alt`/`copyUrl`-shaped payload the way an image does.
 */
export type ResourceOverlayState =
  | { readonly kind: 'image'; readonly image: ImageOverlayImage }
  | { readonly kind: 'pdf'; readonly resource: VaultResource }
  | null;
