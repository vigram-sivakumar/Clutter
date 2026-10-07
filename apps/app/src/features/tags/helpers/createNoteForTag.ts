import type { PageOperations } from '@core/application/page/PageOperations';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';

/**
 * "New note in this tag": the Tags sidebar row's "+" and the tag
 * collection page's primary "New" button share this one implementation.
 *
 * Opens a root-level draft carrying the tag (same openDraft(...) every other
 * "+ New" entry point uses). The tag lives on the draft descriptor and is
 * written into the first frontmatter when the draft is promoted by
 * meaningful content, so the note stays a draft — and vanishes if
 * abandoned empty — like any other new note. openDraft() already
 * opens/selects the draft in the workspace, so no navigation call is needed.
 */
export async function createNoteForTag(
  pageOperations: PageOperations,
  tagExpansionStore: TagExpansionStore,
  tagName: string
): Promise<void> {
  // The draft is listed under its tag in the Tags sidebar (EffectivePageState.
  // getPagesByTag), so expand the tag to make that visible.
  tagExpansionStore.expand(tagName);
  await pageOperations.openDraft({ folderId: null, tags: [tagName] });
}
