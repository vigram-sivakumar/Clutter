import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { readPageFileTimes } from '../ingest/readResourceMetadata';
import { fingerprint } from '../../shared/identity/textFingerprint';
import { AtomicNotCommittedError, isWriteConflict } from '../atomicWrite/atomicWriteErrors';

export interface PersistSyncedPageDocumentDeps {
  readonly fileSystem: VaultFileSystem;
  readonly vault: Vault;
  readonly serializer: FrontmatterSerializer;
  readonly parser: FrontmatterParser;
  readonly rebuilder: PageRebuilder;
  /**
   * Called with the page's path when a repair was refused because the file is no longer what the repair was derived
   * from. The caller reconciles that path from disk (it must not rely on the external edit's own event, which may
   * already have been delivered), and must not install the refused repair.
   */
  readonly onStale?: (path: string) => void;
}

/**
 * Sync-owned write pipeline for reconciling external filesystem changes.
 *
 * Not a general persistence entry point — only VaultSyncService should call
 * this when external events require correcting persisted frontmatter.
 *
 * **A repair is derived from the page Sync inspected, so it may replace only the text that page was built from**
 * (ADR-063). Atomic replacement makes a write all-or-nothing; it does not make a stale write correct. With a provider
 * that replaces files whole, the repair reads the file's text now (or takes the text its caller already read) and
 * proceeds only if that text is the one the page identifies (`page.sourceFingerprint`, the content identity recorded
 * when the page was built; a page without one falls back to its recorded modification time, which is weaker evidence).
 * It then replaces the file only while it still holds exactly that text. Otherwise nothing is written, the vault page
 * is left as it is, `null` is returned (no repair was applied) and `onStale` asks the caller to reconcile the path
 * from disk. Any other provider writes as it
 * always did.
 */
export async function persistSyncedPageDocument(
  deps: PersistSyncedPageDocumentDeps,
  page: Page,
  markdown: string,
  inspectedText?: string
): Promise<Page | null> {
  const document = deps.serializer.serializeDocument(page, markdown);

  if (!deps.fileSystem.writesAreAtomic) {
    await deps.fileSystem.writeFile(page.path, document, 'replace');
  } else {
    const current = inspectedText ?? (await deps.fileSystem.readFile(page.path));

    if (await changedSinceInspected(deps.fileSystem, page, current)) {
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
  const rebuilt = deps.rebuilder.rebuild(
    page,
    parsed,
    await readPageFileTimes(deps.fileSystem, page.path),
    fingerprint(document)
  );

  deps.vault.replacePage(rebuilt);

  return rebuilt;
}

/**
 * Whether the file's current text is no longer the one the page was built from. The content identity decides when the
 * page has one; without it the modification time is the best evidence left (unknown times: not changed).
 */
async function changedSinceInspected(fileSystem: VaultFileSystem, page: Page, currentText: string): Promise<boolean> {
  if (page.sourceFingerprint !== undefined) {
    return fingerprint(currentText) !== page.sourceFingerprint;
  }
  const inspected = page.fileTimes?.modifiedAt;
  if (!inspected) return false;
  const now = await readPageFileTimes(fileSystem, page.path);

  return now !== undefined && now.modifiedAt !== inspected;
}

/** `null`: no repair was applied. The caller carries on with the page it had (it must not install the refused one). */
function skipStaleRepair(deps: PersistSyncedPageDocumentDeps, page: Page, why: string): null {
  console.warn(`Sync: a repair of ${page.path} was skipped because ${why}; it will be reconciled from disk.`);
  deps.onStale?.(page.path);

  return null;
}
