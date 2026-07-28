import type { DocumentSession } from '@core/engine/DocumentSession';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import type { Breadcrumb } from '@components/breadcrumb/Breadcrumbs';
import { buildBreadcrumbs } from '@app/layouts/page/topbar/buildBreadcrumbs';

/**
 * This function is the presentation boundary between the application/domain layers and the Daily Note page UI.
 * It transforms domain objects into a UI-focused model.
 * It intentionally does not mutate the document.
 */
export function toDailyNotePageModel(
  page: Page,
  session: DocumentSession,
  vault: Vault,
  onOpenFolder: (folderId: string) => void
): DailyNotePageModel {
  const revision = session.currentRevision;

  return {
    title: page.name,
    description: page.metadata.description ?? '',
    // Render the current editable document revision rather than the immutable Vault snapshot.
    // This allows the UI to reflect in-memory edits before they are persisted.
    markdown: revision.markdown,
    coverImage: page.metadata.cover,
    breadcrumbs: buildBreadcrumbs(page, vault, onOpenFolder),

    updateDescription(description: string): void {
      void description;
      throw new Error('Not implemented');
    },
  };
}

export interface DailyNotePageModel {
  title: string;
  description: string;
  markdown: string;
  coverImage: string | null;
  breadcrumbs: Breadcrumb[];

  updateDescription(description: string): void;
}
