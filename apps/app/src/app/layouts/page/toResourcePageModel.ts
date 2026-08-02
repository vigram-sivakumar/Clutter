import type { DocumentSession } from '@core/engine/DocumentSession';
import type { Page } from '@core/vault/models/Page';

/**
 * This function is the presentation boundary between the application/domain
 * layers and any editable-markdown page UI (notes, daily notes). It
 * transforms domain objects into a UI-focused model and intentionally does
 * not mutate the document itself.
 */
export function toResourcePageModel(
  page: Page,
  session: DocumentSession,
  onUpdateMarkdown: (pageId: string, markdown: string) => void
): ResourcePageModel {
  const revision = session.currentRevision;

  return {
    title: page.name,
    description: page.metadata.description ?? '',
    // Render the current editable document revision rather than the immutable Vault snapshot.
    // This allows the UI to reflect in-memory edits before they are persisted.
    markdown: revision.markdown,
    coverImage: page.metadata.cover,

    // TODO: Follow the same editing pipeline as updateMarkdown() once
    // description edits are routed through the Application layer.
    // Description edits should never update the Vault or DocumentSession
    // directly from the ViewModel.
    updateDescription(description: string): void {
      void description;

      throw new Error('Not implemented');
    },

    updateMarkdown(markdown: string): void {
      onUpdateMarkdown(page.id, markdown);
    },
  };
}

/**
 * The draft (ADR-017) counterpart: same ResourcePageModel shape, built from
 * a draft id + title (PageOperations.getDraft()) instead of a Vault Page —
 * there is no metadata/description/cover yet, since nothing is persisted.
 */
export function toDraftPageModel(
  draftId: string,
  title: string | undefined,
  session: DocumentSession,
  onUpdateMarkdown: (pageId: string, markdown: string) => void
): ResourcePageModel {
  const revision = session.currentRevision;

  return {
    // Empty, not a literal 'Untitled' string — an untitled draft (New
    // Note) should show a placeholder, not filled-in placeholder-looking
    // text. Daily-note drafts always have a real title by this point
    // (PageOperations.openAtPath derives one from the deterministic
    // path), so this only actually applies to New Note.
    title: title ?? '',
    description: '',
    markdown: revision.markdown,
    coverImage: null,

    updateDescription(): void {
      throw new Error('Not implemented');
    },

    updateMarkdown(markdown: string): void {
      onUpdateMarkdown(draftId, markdown);
    },
  };
}

export interface ResourcePageModel {
  title: string;
  description: string;
  markdown: string;
  coverImage: string | null;

  updateDescription(description: string): void;
  updateMarkdown(markdown: string): void;
}
