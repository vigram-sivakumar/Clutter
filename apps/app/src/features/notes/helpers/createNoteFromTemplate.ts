import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * "New note from a template": opens an ordinary new-note draft in `folderId`
 * (the same openDraft(...) every other "New note" entry point uses), then puts
 * the template's body into it through mutateBody() — the sanctioned route for
 * template insertion (ADR-031). The template itself is never opened or
 * changed, and only its body is copied (no title, tags, icon, cover or
 * properties), so the note stays a draft — and vanishes if abandoned — until
 * it is saved like any other new note. A blank template leaves the empty draft.
 */
export async function createNoteFromTemplate(
  pageOperations: PageOperations,
  folderId: string | null,
  templateMarkdown: string
): Promise<void> {
  const draftId = await pageOperations.openDraft({ folderId });

  if (templateMarkdown.trim() !== '') {
    await pageOperations.mutateBody(draftId, () => templateMarkdown);
  }
}
