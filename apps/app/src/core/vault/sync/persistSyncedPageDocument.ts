import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { readPageFileTimes } from '../ingest/readResourceMetadata';

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
 */
export async function persistSyncedPageDocument(
  deps: PersistSyncedPageDocumentDeps,
  page: Page,
  markdown: string
): Promise<Page> {
  const document = deps.serializer.serializeDocument(page, markdown);

  await deps.fileSystem.writeFile(page.path, document, 'replace');

  const parsed = deps.parser.parse(document);
  const rebuilt = deps.rebuilder.rebuild(page, parsed, await readPageFileTimes(deps.fileSystem, page.path));

  deps.vault.replacePage(rebuilt);

  return rebuilt;
}
