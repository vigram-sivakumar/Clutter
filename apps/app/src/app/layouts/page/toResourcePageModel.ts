import type { DocumentSession } from '@core/engine/DocumentSession';
import type { Page } from '@core/vault/models/Page';
import { isNoteUntitled } from '@core/presentation/isNoteUntitled';

/**
 * This function is the presentation boundary between the application/domain
 * layers and any editable-markdown page UI (notes, daily notes). It
 * transforms domain objects into a UI-focused model and intentionally does
 * not mutate the document itself.
 */
export function toResourcePageModel(
  page: Page,
  session: DocumentSession,
  onUpdateMarkdown: (pageId: string, markdown: string) => void,
  onRequestSave: (pageId: string) => void,
  onUpdateDescription: (pageId: string, description: string) => void
): ResourcePageModel {
  const revision = session.currentRevision;

  return {
    // The header is an editing/identity surface, not a preview — it must
    // keep representing the page's actual title, never body content or a
    // description (that's getPageDisplayLabel's job, for browse surfaces
    // only). Empty, not a literal placeholder string, so EditableText's
    // own placeholder mechanism renders it — the same "browser owns an
    // empty draft, never a filled-in placeholder-looking value" reasoning
    // toDraftPageModel already uses below. Always page.name for a Daily
    // Note: its filename is a real, permanent calendar identity, never
    // something "unset" the way an unnamed Note's is (isNoteUntitled is
    // deliberately always false for daily-note — see its own doc comment).
    title: isNoteUntitled(page) ? '' : page.name,
    description: page.metadata.description ?? '',
    // Render the current editable document revision rather than the immutable Vault snapshot.
    // This allows the UI to reflect in-memory edits before they are persisted.
    markdown: revision.markdown,
    coverImage: page.metadata.cover,

    updateDescription(description: string): void {
      onUpdateDescription(page.id, description);
    },

    updateMarkdown(markdown: string): void {
      onUpdateMarkdown(page.id, markdown);
    },

    requestSave(): void {
      onRequestSave(page.id);
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
  onUpdateMarkdown: (pageId: string, markdown: string) => void,
  onRequestSave: (pageId: string) => void
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

    requestSave(): void {
      onRequestSave(draftId);
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
  requestSave(): void;
}
