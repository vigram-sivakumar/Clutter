import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The one "New template" action: opens a new draft inside Templates, which
 * is created on first use (ADR-030). Shared by the From template picker's
 * leading "New template" row and the sidebar top controls' New template
 * menu item.
 */
export async function createTemplate(
  folderOperations: FolderOperations,
  pageOperations: PageOperations
): Promise<void> {
  const templates = await folderOperations.ensureReservedFolder('templates');
  await pageOperations.openDraft({ folderId: templates.id });
}
