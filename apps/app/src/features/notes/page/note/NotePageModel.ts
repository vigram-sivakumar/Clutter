import type { DocumentSession } from '@core/engine/DocumentSession';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import type { Breadcrumb } from '@components/breadcrumb/Breadcrumbs';
import { buildBreadcrumbs } from '@app/layouts/page/topbar/buildBreadcrumbs';

/**
 * This function is the presentation boundary between the application/domain layers and the Note page UI.
 * It transforms domain objects into a UI-focused model.
 * It intentionally does not mutate the document.
 */
export function toNotePageModel(
  page: Page,
  session: DocumentSession,
  vault: Vault,
  onOpenFolder: (folderId: string) => void,
  onUpdateMarkdown: (pageId: string, markdown: string) => void
): NotePageModel {
  const revision = session.currentRevision;

  return {
    title: page.name,
    description: page.metadata.description ?? '',
    // Render the current editable document revision rather than the immutable Vault snapshot.
    // This allows the UI to reflect in-memory edits before they are persisted.
    markdown: revision.markdown,
    coverImage: page.metadata.cover,
    breadcrumbs: buildBreadcrumbs(page, vault, onOpenFolder),

    // TODO: Route title edits through the Application layer.
    // Target flow:
    // EditableText
    //   -> NotePageModel.rename()
    //   -> PageApplicationService
    //   -> DocumentSession.commit()
    //   -> SaveCoordinator
    //   -> VaultFileSystem
    // The ViewModel must remain a presentation boundary and should never mutate
    // the document directly.
    rename(title: string): void {
      void title;

      throw new Error('Not implemented');
    },

    // TODO: Follow the same editing pipeline as rename().
    // Description edits should never update the Vault or DocumentSession directly
    // from the ViewModel.
    updateDescription(description: string): void {
      void description;

      throw new Error('Not implemented');
    },

    // TODO: Follow the same editing pipeline as rename() and description edits.
    // Markdown edits should be delegated to the application layer rather than
    // mutating the DocumentSession directly from the ViewModel.
    updateMarkdown(markdown: string): void {
      onUpdateMarkdown(page.id, markdown);
    },
  };
}

export interface NotePageModel {
  title: string;
  description: string;
  markdown: string;
  coverImage: string | null;
  breadcrumbs: Breadcrumb[];

  rename(title: string): void;
  updateDescription(description: string): void;
  updateMarkdown(markdown: string): void;
}
