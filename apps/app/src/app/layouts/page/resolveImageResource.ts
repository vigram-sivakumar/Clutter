import type { Vault } from '@core/vault/models/Vault';
import type { ResolveImageResource } from '@features/markdown/editor/MarkdownEditor';

import { resolveResourceEmbed } from './resolveResourceEmbed';

/**
 * Composes the editor's injected `ResolveImageResource` boundary from
 * `resolveResourceEmbed()` — the exact same lookup `resolveEmbedImage.ts`
 * already uses to resolve a Resource embed's target at render time, called
 * here a second time (a second *call site*, never a second
 * implementation) against whichever path identifies the image that was
 * actually clicked. `resolveResourceEmbed` takes any vault-relative path
 * string, not only an Embed's own — reusing it here for a standard
 * Markdown image's `url` too is exactly the same lookup, just applied to a
 * different string.
 */
export function createImageResourceResolver(vault: Vault): ResolveImageResource {
  return (path) => {
    const resource = resolveResourceEmbed(vault, path);
    return resource ? { resourceId: resource.id } : undefined;
  };
}
