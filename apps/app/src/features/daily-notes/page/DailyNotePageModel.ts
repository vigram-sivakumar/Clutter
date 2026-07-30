import type { DocumentSession } from '@core/engine/DocumentSession';
import type { Page } from '@core/vault/models/Page';

/**
 * This function is the presentation boundary between the application/domain layers and the Daily Note page UI.
 * It transforms domain objects into a UI-focused model.
 * It intentionally does not mutate the document.
 */
export function toDailyNotePageModel(
  page: Page,
  session: DocumentSession,
  onUpdateMarkdown: (pageId: string, markdown: string) => void
): DailyNotePageModel {
  const revision = session.currentRevision;

  return {
    title: page.name,
    description: page.metadata.description ?? '',
    // Render the current editable document revision rather than the immutable Vault snapshot.
    // This allows the UI to reflect in-memory edits before they are persisted.
    markdown: revision.markdown,
    coverImage: page.metadata.cover,

    updateDescription(description: string): void {
      void description;
      throw new Error('Not implemented');
    },

    updateMarkdown(markdown: string): void {
      onUpdateMarkdown(page.id, markdown);
    },
  };
}

export interface DailyNotePageModel {
  title: string;
  description: string;
  markdown: string;
  coverImage: string | null;

  updateDescription(description: string): void;
  updateMarkdown(markdown: string): void;
}
