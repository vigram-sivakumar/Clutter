import type { PageType } from '@core/vault/models/Page';

/**
 * The one rule for whether a page's title can be edited. A Daily Note's title is its date, rendered
 * from the filename (`toResourcePageModel`/`toDraftPageModel`) — renaming it would desynchronize
 * the title from the deterministic path every date lookup resolves by, so it is never editable,
 * whether the note is a draft or already saved. Every page-type branch of PageHost (draft and
 * persisted alike) must take `titleEditable` and the title handlers from this function, never from
 * its own condition.
 */
export function isPageTitleEditable(type: PageType): boolean {
  return type !== 'daily-note';
}
