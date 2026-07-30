import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { PageRebuilder } from '../build/PageRebuilder';
import { FrontmatterParser } from '../understand/FrontmatterParser';
import { FrontmatterSerializer } from '../understand/FrontmatterSerializer';
import {
  applyArchiveMetadataCorrection,
  evaluateArchiveMetadataRepair,
} from './archiveMetadataReconciler';
import { persistSyncedPageDocument } from './persistSyncedPageDocument';

export interface ReconcileArchiveMetadataDeps {
  readonly vault: Vault;
  readonly fileSystem: VaultFileSystem;
  readonly serializer: FrontmatterSerializer;
  readonly parser: FrontmatterParser;
  readonly rebuilder: PageRebuilder;
}

/**
 * Reads the page's current vault state, repairs stale archive metadata on
 * disk when needed, and returns the rebuilt page. Returns null when no
 * repair was required.
 */
export async function reconcilePageArchiveMetadata(
  deps: ReconcileArchiveMetadataDeps,
  page: Page
): Promise<Page | null> {
  const correction = evaluateArchiveMetadataRepair(page, deps.vault.root);

  if (!correction) {
    return null;
  }

  const fileContent = await deps.fileSystem.readFile(page.path);
  const parsedMarkdown = deps.parser.parse(fileContent);
  const reconciledPage = applyArchiveMetadataCorrection(page, correction);

  return persistSyncedPageDocument(
    deps,
    reconciledPage,
    parsedMarkdown.body
  );
}

/**
 * Startup pass: repair stale archive metadata for every page in the vault
 * using the same policy as live filesystem sync.
 */
export async function reconcileVaultArchiveMetadata(
  deps: ReconcileArchiveMetadataDeps
): Promise<void> {
  for (const page of deps.vault.pages()) {
    await reconcilePageArchiveMetadata(deps, page);
  }
}
