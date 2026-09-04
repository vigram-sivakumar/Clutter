/**
 * The injected standard-Markdown-image resolution contract — the seam
 * `imageLivePreview.ts` calls to turn a native `![alt](url)` node's own
 * destination into a loadable `<img src>` when that destination happens to
 * be a local Vault path, without ever importing `Vault` itself
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * Composed in the app layer (resolveImageSrc.ts) from the *same*
 * `resolveResourceEmbed()` a local Resource *embed* (`![[path]]`) already
 * uses — this file only defines the shape, never a second lookup.
 *
 * Two outcomes, not three (contrast `EmbedImageResolution`): a standard
 * Markdown image always renders as an `ImageWidget`, working or broken —
 * there is no "decline to render, leave raw Markdown" case the way Embed's
 * `'non-image'` status gives that syntax an escape hatch. So:
 * - `'resolved'`: `path` names a local `VaultResource` with
 *   `kind === 'image'` — `url` is a resolved, loadable file URL for
 *   `<img src>`; `copyUrl` is `path` exactly as written between the
 *   Markdown's own `(...)` parens, for Copy link/Set-as-cover-image (see
 *   `ImageWidget.ts`'s `OpenImageMenuParams.copyUrl` doc comment for why
 *   these must differ once `url` stops being the raw Markdown text).
 * - `'unresolved'`: `path` does not resolve to a local image resource — an
 *   external URL (the overwhelmingly common case), a vault path that
 *   doesn't exist, or one that resolves to a non-image resource (e.g. a
 *   pdf). The caller's existing, unchanged behavior — pass `path` straight
 *   through as `url`, no `copyUrl` — is exactly correct for all three: an
 *   external URL loads as it always has, and a non-loadable local path
 *   falls into the real `<img>` load-failure flow exactly as it already
 *   does today, never a pre-guessed broken state (unlike Embed, whose
 *   `resolveResourceEmbed()` lookup happening at all is proof positive the
 *   author meant a local resource, standard Markdown image destinations
 *   carry no such signal — a failed lookup here is not evidence of
 *   anything, so it is never treated as one).
 */
export type ImageSrcResolution =
  | { readonly status: 'resolved'; readonly url: string; readonly copyUrl: string }
  | { readonly status: 'unresolved' };

/** `path` is the Image node's own already-parsed destination (imageScanner.ts's ImageMatch.url) — never re-parsed here. */
export type ResolveImageSrc = (path: string) => ImageSrcResolution;
