import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { Vault } from '../models/Vault';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { PageRebuilder } from '../ingest/PageRebuilder';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { FrontmatterSerializer } from '../ingest/FrontmatterSerializer';
import {
  applyArchiveMetadataCorrection,
  evaluateArchiveMetadataRepair,
} from './ArchiveMetadataReconciler';
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
 * ADR-026's Sync amendment: the folder-scoped counterpart to
 * reconcilePageArchiveMetadata. Takes the *candidate* folder (its final
 * path/parentId already resolved by the caller — live sync's post-move
 * destination, or the boot pass's already-current one) so a repair, when
 * needed, lands as a single Vault commit carrying the fully-corrected
 * final state, never a separate "moved" mutation followed by a "corrected"
 * one (the ADR's frozen rule 5).
 *
 * Unlike a page, a folder has no body/markdown to re-parse or rebuild
 * (`.folder.md` is frontmatter-only, see FrontmatterSerializer.serializeFolderDocument)
 * — the corrected Folder is computed purely in memory via
 * applyArchiveMetadataCorrection, written to disk, then committed to the
 * Vault via Vault.correctFolderArchiveMetadata (the one method that can
 * apply a path change and a metadata patch as a single mutation+notify,
 * reusing the exact same relocation cascade archiveFolder()/moveFolder()
 * already share). Returns null when no repair was required.
 */
export async function reconcileFolderArchiveMetadata(
  deps: Pick<ReconcileArchiveMetadataDeps, 'vault' | 'fileSystem' | 'serializer'>,
  candidateFolder: Folder
): Promise<Folder | null> {
  const correction = evaluateArchiveMetadataRepair(candidateFolder, deps.vault.root);

  if (!correction) {
    return null;
  }

  const reconciledFolder = applyArchiveMetadataCorrection(candidateFolder, correction);

  await deps.fileSystem.writeFile(
    `${reconciledFolder.path}/.folder.md`,
    deps.serializer.serializeFolderDocument(reconciledFolder)
  );

  deps.vault.correctFolderArchiveMetadata(
    reconciledFolder.id,
    reconciledFolder.path,
    reconciledFolder.parentId,
    correction
  );

  return deps.vault.getFolder(reconciledFolder.id)!;
}

/**
 * Startup pass: repair stale archive metadata for every page and folder in
 * the vault, using the same policy as live filesystem sync. One call site
 * (Application.ts), no new wiring needed for the folder loop — the same
 * deps already cover what reconcileFolderArchiveMetadata needs.
 */
export async function reconcileVaultArchiveMetadata(
  deps: ReconcileArchiveMetadataDeps
): Promise<void> {
  for (const page of deps.vault.pages()) {
    await reconcilePageArchiveMetadata(deps, page);
  }

  for (const folder of deps.vault.folders()) {
    await reconcileFolderArchiveMetadata(deps, folder);
  }
}
