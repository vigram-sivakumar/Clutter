import type { SystemIcon } from '@shared/icon';

import type { MediaAlignment } from './mediaPresentationModel';

/**
 * The "Position" choices for an embedded image or PDF, in menu order. One list for both embeds'
 * menus, so their labels and icons never drift. The icons are the page cover's Position family
 * (`positionRight`, with a mirrored `positionLeft` and a `positionCenter` in the same style).
 */
export const MEDIA_ALIGNMENT_ITEMS: ReadonlyArray<{
  readonly alignment: MediaAlignment;
  readonly label: string;
  readonly icon: SystemIcon;
}> = [
  { alignment: 'left', label: 'Left', icon: 'positionLeft' },
  { alignment: 'center', label: 'Center', icon: 'positionCenter' },
  { alignment: 'right', label: 'Right', icon: 'positionRight' },
];
