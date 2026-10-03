import type { PageOperations } from '@core/application/page/PageOperations';

/**
 * "New note in this tag": the Tags sidebar row's "+" and the tag
 * collection page's primary "New" button share this one implementation.
 *
 * Opens a root-level draft (same openDraft(...) every other "+ New" entry
 * point uses), then a single updateMetadata() carrying the tag, which
 * PageOperations' draft-promotion branch treats as a committed change and
 * persists immediately (same mechanism Cover Image uses to promote a draft
 * via a metadata edit). openDraft() already opens/selects the new note in
 * the workspace, so no separate navigation call is needed.
 */
export async function createNoteForTag(
  pageOperations: PageOperations,
  tagName: string
): Promise<void> {
  const draftId = await pageOperations.openDraft({ folderId: null });
  await pageOperations.updateMetadata(draftId, { tags: [tagName] });
}
