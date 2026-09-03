/**
 * The injected "does this image have a local `VaultResource` behind it"
 * contract — `ImageOverlay`'s own More Actions control is a resource-action
 * surface (Rename/Move/Reveal in Finder/Copy path/Archive, the same set the
 * Sidebar's own resource row menu offers), so it only ever renders for an
 * image that actually resolves to one; an external URL with nothing behind
 * it gets no button at all, never an empty/disabled menu.
 *
 * Composed in the app layer (`resolveImageResource.ts`) from the same
 * `resolveResourceEmbed()` a local Resource *embed* (`![[path]]`) already
 * uses to resolve at render time — this is not a second resolution
 * mechanism, only a second call site for the existing one, reused against
 * whichever path string identifies the clicked image (see
 * `MarkdownEditor.tsx`'s own `onImageClickRef`, and `ImageWidget.ts`'s
 * `OnImageClick`'s own doc comment for exactly which string that is for
 * each of the two image forms). Never resolves from a display name/alt
 * text — only ever from a path.
 *
 * Just the id, not the full `VaultResource` — the editor layer never
 * imports `Vault`/domain models directly (docs/editor-architecture-
 * decisions.md, "Editor/persistence boundary"), the same reason
 * `EmbedImageResolution` returns a plain data shape rather than a
 * `VaultResource` too.
 */
export type ResolveImageResource = (
  path: string
) => { readonly resourceId: string } | undefined;
