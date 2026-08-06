import type { Folder } from '../vault/models/Folder';
import type { PageDisplayLabel } from './getPageDisplayLabel';
import { isFolderUntitled } from './isFolderUntitled';
import { getFolderTitlePlaceholder } from './PageDisplayPlaceholders';

/**
 * The folder-side counterpart to getPageDisplayLabel. Folders have no
 * description or body to fall back through — Folder has neither field —
 * so the precedence chain is just: the user-given name, or the shared
 * placeholder when that name is still the generated default. Returns the
 * same PageDisplayLabel shape (and is read by the same
 * getPageDisplayLabelStyle) so every rendering surface treats a folder's
 * label exactly like a page's, without a second styling rule to drift.
 *
 * Presentation-only, same as getPageDisplayLabel: never persisted, never
 * used for path resolution or collision checks, both of which continue to
 * resolve against the real folder.name.
 */
export function getFolderDisplayLabel(folder: Folder): PageDisplayLabel {
  if (!isFolderUntitled(folder)) {
    return { text: folder.name, source: 'title' };
  }

  return { text: getFolderTitlePlaceholder(), source: 'placeholder' };
}
