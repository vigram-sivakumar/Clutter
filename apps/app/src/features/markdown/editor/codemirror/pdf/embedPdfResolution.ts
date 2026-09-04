/**
 * The injected Embed-PDF resolution contract — the PDF-scoped counterpart
 * to `embed/embedImageResolution.ts`'s `EmbedImageResolution`/
 * `ResolveEmbedImage`. `embedLivePreview.ts` calls this only after the
 * existing image resolver has already said `{ status: 'non-image' }` for a
 * target — i.e. `resolveResourceEmbed()` already found a real
 * `VaultResource` for this path, it just isn't of kind `'image'`. Given
 * `VaultResourceKind = 'pdf' | 'image'`, that makes `'pdf'` the only
 * reachable outcome here today; `'non-pdf'`/`'unresolved'` exist for the
 * same reason `EmbedImageResolution` keeps its own symmetric shape —
 * forward-compatible with a future third resource kind, and consistent
 * with the composer pattern `resolveEmbedImage.ts`/`resolveImageSrc.ts`/
 * `resolveImageResource.ts` already each establish independently.
 *
 * `url`/`path` are plain strings, never a `VaultResource` — the editor
 * layer must never import `Vault` types (the same boundary
 * `ImageWidget.ts`'s `OnImageClick`/`copyUrl` already respects). `path` is
 * the embed's own vault-relative target exactly as written between
 * `![[...]]`'s brackets — what the "Open" action hands back to the app
 * layer to re-resolve into the real `VaultResource` `PdfOverlay` needs.
 */
export type EmbedPdfResolution =
  | { readonly status: 'pdf'; readonly url: string; readonly title: string; readonly path: string }
  | { readonly status: 'unresolved'; readonly title: string }
  | { readonly status: 'non-pdf' };

/** `path`/`alias` are the Embed's own already-parsed target/alias (embedScanner.ts's EmbedMatch) — never re-parsed here. */
export type ResolveEmbedPdf = (path: string, alias: string | null) => EmbedPdfResolution;
