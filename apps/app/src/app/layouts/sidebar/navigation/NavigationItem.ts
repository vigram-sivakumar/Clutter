import type { SystemIcon } from '@shared/icon';

/**
 * One row in a sidebar navigation list — deliberately not named around
 * "shortcut": the same shape covers any feature's fixed set of sidebar
 * actions (Notes' New/Inbox/Templates, Tasks'/Tags' New, and whatever a
 * future feature adds), and should extend cleanly (badges, counts,
 * secondary text, keybindings) without a rename. Daily Notes' calendar
 * is not this shape — a continuous date picker isn't a fixed action
 * list, and forcing it into one would be artificial, not consistency.
 */
export interface NavigationItem<TId extends string = string> {
  readonly id: TId;
  readonly title: string;
  readonly icon: SystemIcon;
  readonly disabled?: boolean;
}
