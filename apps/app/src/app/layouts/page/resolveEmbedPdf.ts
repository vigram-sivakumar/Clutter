import type { Vault } from '@core/vault/models/Vault';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { ResolveEmbedPdf } from '@features/markdown/editor/codemirror/pdf/embedPdfResolution';
import { resolveEmbedAliasFields } from '@features/markdown/editor/codemirror/mediaPresentation/mediaPresentationUpdate';

import { resolveResourceEmbed } from './resolveResourceEmbed';

/**
 * Composes `resolveResourceEmbed()` + a resolved file URL into the editor's
 * injected `ResolveEmbedPdf` boundary — the PDF-scoped counterpart to
 * `resolveEmbedImage.ts`'s `createEmbedImageResolver`, same narrow-composer
 * shape. `embedLivePreview.ts` only ever calls this after the image
 * resolver has already said `{ status: 'non-image' }` for a target, i.e.
 * `resolveResourceEmbed()` already found a real `VaultResource` — this
 * function never re-implements that lookup, only reacts to it a second time
 * for the PDF-specific question.
 */
export function createEmbedPdfResolver(
  vault: Vault,
  resolveResourceUrl: (path: string) => string
): ResolveEmbedPdf {
  return (path, alias) => {
    // A metadata-shaped alias (`|6,center`, per mediaPresentationUpdate.ts's
    // `resolveEmbedAliasFields` — Obsidian-style pipe presentation syntax)
    // is never a real title, the same way `resolveEmbedImage.ts` already
    // treats it for embedded images — only a genuine, non-metadata-shaped
    // alias ever reaches `title` below.
    const displayAlias = resolveEmbedAliasFields(alias).displayAlias;
    const resource = resolveResourceEmbed(vault, path);

    if (!resource) {
      // Mirrors resolveEmbedImage.ts's own unresolved-display-label rule.
      return { status: 'unresolved', title: displayAlias ?? VaultPath.stemName(path) };
    }

    if (resource.kind !== 'pdf') {
      return { status: 'non-pdf' };
    }

    return {
      status: 'pdf',
      url: resolveResourceUrl(resource.path),
      title: displayAlias ?? getResourceDisplayName(resource),
      // The vault-relative path exactly as written between the embed's own
      // `![[...]]` brackets — what the "Open" action hands back to the app
      // layer to re-resolve into the real `VaultResource` `PdfOverlay` needs
      // (see PageHost.tsx's onPdfEmbedClick composition).
      path,
      // Already resolved right above — the inline embed's own "More
      // actions" control dispatches against this directly, no separate
      // click-time resolution step (unlike ImageOverlay's resourceId gate).
      resourceId: resource.id,
    };
  };
}
