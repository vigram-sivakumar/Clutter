import type { SystemIcon } from '@shared/icon';

import type { MediaAlignment } from './mediaPresentationModel';

/**
 * The "Position" choices for an embedded image or PDF, in menu order. One list for both embeds'
 * menus, so their labels and icons never drift. Left and Center only: the Markdown format still
 * accepts `right`, so an embed already written that way keeps rendering right-aligned, it just has
 * no menu entry. The icons are the page cover's Position family (a mirrored `positionLeft` and a
 * `positionCenter` in the cover's own style).
 */
export const MEDIA_ALIGNMENT_ITEMS: ReadonlyArray<{
  readonly alignment: MediaAlignment;
  readonly label: string;
  readonly icon: SystemIcon;
}> = [
  { alignment: 'left', label: 'Left', icon: 'positionLeft' },
  { alignment: 'center', label: 'Center', icon: 'positionCenter' },
];
