import type { Vault } from '@core/vault/models/Vault';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { ResolveEmbedPdf } from '@features/markdown/editor/codemirror/pdf/embedPdfResolution';

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
    const resource = resolveResourceEmbed(vault, path);

    if (!resource) {
      // Mirrors resolveEmbedImage.ts's own unresolved-display-label rule.
      return { status: 'unresolved', title: alias ?? VaultPath.stemName(path) };
    }

    if (resource.kind !== 'pdf') {
      return { status: 'non-pdf' };
    }

    return {
      status: 'pdf',
      url: resolveResourceUrl(resource.path),
      title: alias ?? getResourceDisplayName(resource),
      // The vault-relative path exactly as written between the embed's own
      // `![[...]]` brackets — what the "Open" action hands back to the app
      // layer to re-resolve into the real `VaultResource` `PdfOverlay` needs
      // (see PageHost.tsx's onPdfEmbedClick composition).
      path,
    };
  };
}
