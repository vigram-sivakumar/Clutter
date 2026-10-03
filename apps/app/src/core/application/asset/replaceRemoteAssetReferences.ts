import type { Asset } from '../../vault/models';
import { ImageReferenceExtractor } from '../../vault/ingest/extractors/ImageReferenceExtractor';

/** The slice of PageOperations this needs — its existing, Gate-backed edits. */
export interface PageReferenceWriter {
  updateMetadata(pageId: string, patch: { cover: string }): Promise<void>;
  mutateBody(pageId: string, transform: (markdown: string) => string): Promise<void>;
}

/** The slice of FolderOperations this needs. */
export interface FolderReferenceWriter {
  updateMetadata(folderId: string, patch: { cover: string }): Promise<void>;
}

const imageExtractor = new ImageReferenceExtractor();

/**
 * Points every use of a remote asset at its saved vault copy: each page or
 * folder cover, and each standard Markdown image in a note body. Writes only
 * through the existing facades (PageOperations.mutateBody/updateMetadata,
 * FolderOperations.updateMetadata), so open editors, autosave and the
 * Persistence Gate behave as for any other edit — nothing is written here.
 *
 * Every use is attempted even if one fails (e.g. an archived note, which
 * can't be edited); the failures are reported together afterwards.
 */
export async function replaceRemoteAssetReferences(
  asset: Asset,
  reference: string,
  pages: PageReferenceWriter,
  folders: FolderReferenceWriter
): Promise<void> {
  if (asset.source !== 'remote') {
    return;
  }

  const failures: string[] = [];

  for (const use of asset.references) {
    const { kind, id } = use.referrer;

    try {
      if (use.usage === 'cover') {
        await (kind === 'page' ? pages : folders).updateMetadata(id, { cover: reference });
      } else if (use.usage === 'embed' && kind === 'page') {
        await pages.mutateBody(id, (markdown) =>
          imageExtractor.replaceSource(markdown, asset.url, reference)
        );
      }
    } catch (error) {
      failures.push(`${kind} ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `The image was saved, but ${failures.length} use(s) still point at the web copy — ${failures.join('; ')}`
    );
  }
}
