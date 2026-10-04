import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { RowCompletion } from '../completionPopup/completionRow';

/** How a Tag suggestion reads in the popup: the tag icon and the tag's name (the icon says "tag", so no `#`). */
export function tagRow(name: string): RowCompletion['row'] {
  return { iconSvg: COMPLETION_ICONS.tag, title: name };
}
