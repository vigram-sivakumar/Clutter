import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { RowCompletion } from '../completionPopup/completionRow';

/** How a Tag suggestion reads in the popup: the tag icon and the tag's name (the icon says "tag", so no `#`). */
export function tagRow(name: string): RowCompletion['row'] {
  return { iconSvg: COMPLETION_ICONS.tag, title: name, compact: true };
}

/** How the "make this a new tag" row reads: the plus icon and `Create "name"`, as a new note does in `[[`. */
export function tagCreateRow(name: string): RowCompletion['row'] {
  return { iconSvg: COMPLETION_ICONS.plus, title: `Create "${name}"`, compact: true };
}
