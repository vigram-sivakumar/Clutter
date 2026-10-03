import type { Folder, Page } from '../../vault/models';
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

/** One use that could not be rewritten. */
export interface FailedRewrite {
  readonly kind: 'page' | 'folder';
  readonly id: string;
  readonly usage: 'cover' | 'embed';
  readonly message: string;
}

/** What rewriting every use of a remote image did. */
export interface RewriteSummary {
  /** Uses now pointing at the saved copy. */
  readonly rewritten: number;
  /** Uses whose rewrite was attempted and failed. */
  readonly failed: readonly FailedRewrite[];
  /** Uses left alone because their note or folder is archived (an archived note can't be edited). */
  readonly skippedArchived: number;
  /** Uses left alone because the cover is hidden (`coverHidden`) — a hidden cover is not in use. */
  readonly skippedHidden: number;
}

export interface RewriteInput {
  readonly url: string;
  /** The vault-relative reference of the saved copy. */
  readonly reference: string;
  readonly pages: Iterable<Page>;
  readonly folders: Iterable<Folder>;
  /** The note's current Markdown — the open editor's unsaved text when it has one, else the saved text. */
  readonly currentMarkdown: (page: Page) => string;
  readonly isPageArchived: (page: Page) => boolean;
  readonly isFolderArchived: (folder: Folder) => boolean;
  readonly pageWriter: PageReferenceWriter;
  readonly folderWriter: FolderReferenceWriter;
}

const imageExtractor = new ImageReferenceExtractor();

/**
 * Points every use of a remote image URL at its saved vault copy.
 *
 * What counts as a use, and what happens to it:
 *   - a page cover or a folder cover equal to the URL  -> rewritten
 *     (unless the cover is hidden -> skipped, or its owner is archived -> skipped)
 *   - a standard Markdown image `![alt](url)` in a note body -> rewritten
 *     (unless the note is archived -> skipped)
 *   - a plain link `[text](url)`, an image inside code, or a `![[...]]`
 *     wiki embed -> not a use at all, never touched
 *
 * Writes go only through the existing facades (PageOperations.mutateBody /
 * updateMetadata, FolderOperations.updateMetadata), so open editors, autosave
 * and the Persistence Gate behave as for any other edit; nothing is written
 * here. Every use is attempted even if another fails, and the outcome is
 * returned, never thrown, so the caller can report exactly what happened.
 * A body rewrite replaces *every* matching image in that note in one edit.
 */
export async function rewriteRemoteAssetReferences(input: RewriteInput): Promise<RewriteSummary> {
  const { url, reference } = input;
  let rewritten = 0;
  let skippedArchived = 0;
  let skippedHidden = 0;
  const failed: FailedRewrite[] = [];

  const attempt = async (
    kind: FailedRewrite['kind'],
    id: string,
    usage: FailedRewrite['usage'],
    write: () => Promise<void>
  ): Promise<void> => {
    try {
      await write();
      rewritten += 1;
    } catch (error) {
      failed.push({ kind, id, usage, message: error instanceof Error ? error.message : String(error) });
    }
  };

  for (const page of input.pages) {
    const hasCover = page.metadata.cover?.trim() === url;
    const hasBodyImage = imageExtractor.extract(input.currentMarkdown(page)).includes(url);

    if (!hasCover && !hasBodyImage) {
      continue;
    }

    if (input.isPageArchived(page)) {
      skippedArchived += Number(hasCover) + Number(hasBodyImage);
      continue;
    }

    if (hasCover) {
      if (page.metadata.coverHidden) {
        skippedHidden += 1;
      } else {
        await attempt('page', page.id, 'cover', () =>
          input.pageWriter.updateMetadata(page.id, { cover: reference })
        );
      }
    }

    if (hasBodyImage) {
      await attempt('page', page.id, 'embed', () =>
        input.pageWriter.mutateBody(page.id, (markdown) =>
          imageExtractor.replaceSource(markdown, url, reference)
        )
      );
    }
  }

  for (const folder of input.folders) {
    if (folder.metadata.cover?.trim() !== url) {
      continue;
    }

    if (input.isFolderArchived(folder)) {
      skippedArchived += 1;
    } else if (folder.metadata.coverHidden) {
      skippedHidden += 1;
    } else {
      await attempt('folder', folder.id, 'cover', () =>
        input.folderWriter.updateMetadata(folder.id, { cover: reference })
      );
    }
  }

  return { rewritten, failed, skippedArchived, skippedHidden };
}
