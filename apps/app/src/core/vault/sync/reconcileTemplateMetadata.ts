import type { Page } from '../models/Page';
import { VaultPath } from '../ingest/VaultPath';
import { evaluateTemplateMarker } from '../ingest/frontmatter/templateMarker';
import { reservedFolderRelativePath } from '../initialize/ReservedResources';
import { persistSyncedPageDocument } from './persistSyncedPageDocument';
import type { ReconcileArchiveMetadataDeps } from './reconcileArchiveMetadata';

export type ReconcileTemplateMetadataDeps = ReconcileArchiveMetadataDeps;

export function isInsideTemplatesFolder(absolutePath: string, vaultRoot: string): boolean {
  // Path-based, like isInsideArchiveFolder: Sync reconciles a candidate
  // page whose parentId may not be resolved yet, and only has a vaultRoot
  // string, not necessarily a Templates Folder entity.
  return VaultPath.isDescendantOf(
    absolutePath,
    `${vaultRoot}/${reservedFolderRelativePath('templates')}`
  );
}

/**
 * ADR-041: the reserved Templates folder is the source of truth for
 * template status. Repairs the page's `kind: template` marker on disk when
 * it disagrees with where the page lives — added inside Templates/, removed
 * outside it — and returns the rebuilt page, or null when no repair was
 * needed. Takes the *candidate* page (final path already resolved by the
 * caller) so a repair is a single Vault commit, never a "moved" mutation
 * followed by a "corrected" one, exactly like reconcilePageArchiveMetadata.
 *
 * The rule itself (evaluateTemplateMarker) is shared with
 * PageOperations.move(); this only decides *when* it applies and persists
 * through Sync's own write pipeline. Archived pages are skipped — their
 * frontmatter is not edited, and a restore returns them with their marker
 * intact.
 */
export async function reconcilePageTemplateMarker(
  deps: ReconcileTemplateMetadataDeps,
  page: Page
): Promise<Page | null> {
  if (page.metadata.status === 'archived') {
    return null;
  }

  const lines = evaluateTemplateMarker(
    page.metadata.unownedFrontmatter ?? [],
    isInsideTemplatesFolder(page.path, deps.vault.root)
  );

  if (lines === null) {
    return null;
  }

  const fileContent = await deps.fileSystem.readFile(page.path);
  const parsedMarkdown = deps.parser.parse(fileContent);
  const reconciledPage: Page = {
    ...page,
    metadata: { ...page.metadata, unownedFrontmatter: lines },
  };

  return persistSyncedPageDocument(deps, reconciledPage, parsedMarkdown.body);
}

/**
 * Startup pass (beside reconcileVaultArchiveMetadata): repairs the marker
 * for every page, covering moves made while the app was closed.
 */
export async function reconcileVaultTemplateMetadata(
  deps: ReconcileTemplateMetadataDeps
): Promise<void> {
  for (const page of deps.vault.pages()) {
    await reconcilePageTemplateMarker(deps, page);
  }
}
