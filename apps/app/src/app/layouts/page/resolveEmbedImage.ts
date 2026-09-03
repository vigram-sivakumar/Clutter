import type { Vault } from '@core/vault/models/Vault';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { ResolveEmbedImage } from '@features/markdown/editor/MarkdownEditor';

import { resolveResourceEmbed } from './resolveResourceEmbed';

/**
 * Composes `resolveResourceEmbed()` + `Application.resolveResourceImageUrl()`
 * into the editor's injected `ResolveEmbedImage` boundary — the editor
 * itself never imports `Vault` or `Application`
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * Presentation-layer glue in the same vein as `resolveWikiLink.ts`/
 * `wikiLinkSuggestions.ts`, not a new Resource lookup: `resolveResourceEmbed()`
 * is the one and only place an Embed target string turns into a
 * `VaultResource` — this function never re-implements or duplicates that
 * lookup, only reacts to its result.
 *
 * `resolveResourceImageUrl` is passed in as a plain function (not the whole
 * `Application`) — the same narrow-dependency shape `Sidebar.tsx`/
 * `PageHost.tsx`'s own `application.resolveResourceImageUrl(resource.path)`
 * call sites already use, just threaded one layer further in here.
 */
export function createEmbedImageResolver(
  vault: Vault,
  resolveResourceImageUrl: (path: string) => string
): ResolveEmbedImage {
  return (path, alias) => {
    const resource = resolveResourceEmbed(vault, path);

    if (!resource) {
      // Missing, renamed, or moved — nothing to load. `alt` mirrors
      // resolveWikiLink.ts's own unresolved-display-label rule (local
      // alias, else the bare target's own display name) rather than the
      // raw vault-relative path, for the same reason: a folder-qualified
      // path leaking into rendered UI is exactly what that precedent
      // avoids. `VaultPath.filename` (not `.pageName` — an unresolved
      // Embed target keeps its extension, unlike a WikiLink's `.md`-less
      // page path) is the same "path → display name" step every other
      // resolved case here already takes via `resource.name`
      // (ResourceBuilder.ts derives that identically); the only reason
      // this one branch needs to call it explicitly is that there is no
      // `VaultResource` to read `.name` off in the first place.
      return { status: 'unresolved', alt: alias ?? VaultPath.filename(path) };
    }

    if (resource.kind !== 'image') {
      // A pdf resource — out of scope for this milestone (image embeds
      // only). Not an error: resolveResourceEmbed() already found the
      // exact resource this path names, this function just declines to
      // render it as an image.
      return { status: 'non-image' };
    }

    return {
      status: 'image',
      url: resolveResourceImageUrl(resource.path),
      // The vault-relative path exactly as written between the embed's
      // own `![[...]]` brackets — never the resolved file URL — for Copy
      // link/Set-as-cover-image (ImageWidget.ts's OpenImageMenuParams.copyUrl
      // doc comment has the full reasoning).
      copyUrl: path,
      alt: alias ?? resource.name,
    };
  };
}
