import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * The topbar's "Use as template" entry point: make sure the reserved
 * Templates folder exists (ADR-030 — it is only materialized when a
 * feature needs it, and this is such a feature), then move the note into
 * it. Both steps are the existing facade operations; nothing here writes
 * anything itself.
 */
export async function moveToTemplatesFolder(
  folderOperations: FolderOperations,
  pageOperations: PageOperations,
  pageId: string
): Promise<void> {
  const templates = await folderOperations.ensureReservedFolder('templates');
  // The one sanctioned way a note crosses into Templates (ADR-049): converting it to a template.
  await pageOperations.move(pageId, templates.id, { toTemplates: true });
}
