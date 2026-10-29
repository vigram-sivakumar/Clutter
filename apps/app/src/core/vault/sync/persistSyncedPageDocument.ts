import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { readPageFileTimes } from '../ingest/readResourceMetadata';
import { AtomicNotCommittedError, isWriteConflict } from '../atomicWrite/atomicWriteErrors';

export interface PersistSyncedPageDocumentDeps {
  readonly fileSystem: VaultFileSystem;
  readonly vault: Vault;
  readonly serializer: FrontmatterSerializer;
  readonly parser: FrontmatterParser;
  readonly rebuilder: PageRebuilder;
}

/**
 * Sync-owned write pipeline for reconciling external filesystem changes.
 *
 * Not a general persistence entry point — only VaultSyncService should call
 * this when external events require correcting persisted frontmatter.
 *
 * **A repair is derived from what Sync inspected earlier, so it must not overwrite anything newer** (ADR-063).
 * Atomic replacement makes a write all-or-nothing; it does not make a stale write correct. With a provider that
 * replaces files whole, the repair therefore (1) reads the file's text now, (2) refuses if the file's modification
 * time is no longer the one the page was built from, and (3) replaces the file only while it still holds exactly the
 * text read in step 1. If any of that fails, nothing is written: the page is left as it is and the external edit's own
 * filesystem event reconciles from disk. `inspectedText` is the text the caller already read for this page, when it
 * has one. Any other provider writes as it always did.
 */
export async function persistSyncedPageDocument(
  deps: PersistSyncedPageDocumentDeps,
  page: Page,
  markdown: string,
  inspectedText?: string
): Promise<Page> {
  const document = deps.serializer.serializeDocument(page, markdown);

  if (!deps.fileSystem.writesAreAtomic) {
    await deps.fileSystem.writeFile(page.path, document, 'replace');
  } else {
    const current = inspectedText ?? (await deps.fileSystem.readFile(page.path));

    if (await changedSinceInspected(deps.fileSystem, page)) {
      return skipStaleRepair(deps, page, 'the file changed after it was inspected');
    }

    try {
      await deps.fileSystem.writeFile(page.path, document, { replaceIf: current });
    } catch (error) {
      if (isWriteConflict(error) || (error instanceof AtomicNotCommittedError && error.reason === 'targetMissing')) {
        return skipStaleRepair(deps, page, 'the file changed or disappeared while it was being repaired');
      }
      throw error;
    }
  }

  const parsed = deps.parser.parse(document);
  const rebuilt = deps.rebuilder.rebuild(page, parsed, await readPageFileTimes(deps.fileSystem, page.path));

  deps.vault.replacePage(rebuilt);

  return rebuilt;
}

/** Whether the file's modification time differs from the one the page was built from (unknown times: not changed). */
async function changedSinceInspected(fileSystem: VaultFileSystem, page: Page): Promise<boolean> {
  const inspected = page.fileTimes?.modifiedAt;
  if (!inspected) return false;
  const now = await readPageFileTimes(fileSystem, page.path);

  return now !== undefined && now.modifiedAt !== inspected;
}

function skipStaleRepair(deps: PersistSyncedPageDocumentDeps, page: Page, why: string): Page {
  console.warn(`Sync: a repair of ${page.path} was skipped because ${why}; it will be reconciled from disk.`);

  return deps.vault.getPage(page.id) ?? page;
}
