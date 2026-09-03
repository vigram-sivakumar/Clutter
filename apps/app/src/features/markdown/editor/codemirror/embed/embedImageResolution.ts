/**
 * The injected Embed-image resolution contract — the seam
 * `embedLivePreview.ts` calls to turn an Embed's target path into
 * something it can hand `ImageWidget`, without ever importing `Vault`
 * itself (docs/editor-architecture-decisions.md, "Editor/persistence
 * boundary"). Composed in the app layer (resolveEmbedImage.ts) from
 * `resolveResourceEmbed()` + `Application.resolveResourceImageUrl()` —
 * this file only defines the shape, never the lookup.
 *
 * Three outcomes, not two, because a resolved `VaultResource` and a
 * renderable image are genuinely different questions:
 * - `'image'`: the target resolves to a `VaultResource` with
 *   `kind === 'image'` — `url` is what `<img src>` needs (a resolved,
 *   loadable file URL); `copyUrl` is the vault-relative path exactly as
 *   written between the embed's own `![[...]]` brackets, for Copy
 *   link/Set-as-cover (see `ImageWidget.ts`'s `OpenImageMenuParams.copyUrl`
 *   doc comment for why these must differ).
 * - `'unresolved'`: the target does not resolve to any `VaultResource` at
 *   all (missing, renamed, or moved away) — nothing to load; the caller
 *   renders the broken-resource state directly, never a real `<img>`
 *   attempt for a URL that doesn't exist.
 * - `'non-image'`: the target resolves to a real `VaultResource`, but not
 *   one of kind `'image'` (a pdf, in this milestone) — out of scope; the
 *   caller leaves the raw Markdown undecorated rather than rendering
 *   anything for it.
 */
export type EmbedImageResolution =
  | { readonly status: 'image'; readonly url: string; readonly copyUrl: string; readonly alt: string }
  | { readonly status: 'unresolved'; readonly alt: string }
  | { readonly status: 'non-image' };

/** `path`/`alias` are the Embed's own already-parsed target/alias (embedScanner.ts's EmbedMatch) — never re-parsed here. */
export type ResolveEmbedImage = (path: string, alias: string | null) => EmbedImageResolution;
