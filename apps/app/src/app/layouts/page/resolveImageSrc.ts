import type { Vault } from '@core/vault/models/Vault';
import type { ResolveImageSrc } from '@features/markdown/editor/MarkdownEditor';

import { resolveResourceEmbed } from './resolveResourceEmbed';

/**
 * Composes `resolveResourceEmbed()` + `Application.resolveResourceImageUrl()`
 * into the editor's injected `ResolveImageSrc` boundary — the standard-
 * Markdown-image counterpart to `resolveEmbedImage.ts`'s
 * `createEmbedImageResolver`, reusing the exact same `resolveResourceEmbed()`
 * lookup rather than a second one (per the approved distinction: Embed and
 * standard Image share resolution plumbing, never a duplicate).
 *
 * `resolveResourceImageUrl` is passed in as a plain function, same narrow-
 * dependency shape `createEmbedImageResolver` already takes it in.
 */
export function createImageSrcResolver(
  vault: Vault,
  resolveResourceImageUrl: (path: string) => string
): ResolveImageSrc {
  return (path) => {
    const resource = resolveResourceEmbed(vault, path);

    if (!resource || resource.kind !== 'image') {
      // Not a local Vault image — an external URL, a missing/renamed local
      // path, or a non-image resource (e.g. a pdf). The caller's existing
      // behavior (pass `path` straight through, unchanged) is correct for
      // all three — see ImageSrcResolution's own doc comment.
      return { status: 'unresolved' };
    }

    return {
      status: 'resolved',
      url: resolveResourceImageUrl(resource.path),
      // The vault-relative path exactly as written between the standard
      // image's own `(...)` parens — never the resolved file URL — for
      // Copy link/Set-as-cover-image, same reasoning as
      // createEmbedImageResolver's identical `copyUrl: path`.
      copyUrl: path,
    };
  };
}
