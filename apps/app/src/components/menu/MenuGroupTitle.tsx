import type { ReactNode } from 'react';

import { Entry } from '@components/entry/Entry';

import './MenuGroupTitle.css';

export interface MenuGroupTitleProps {
  readonly children: ReactNode;
  /** Independently-clickable content pinned to the right edge (e.g. a dismiss button) — `Entry`'s own `trailing` slot, reused as-is. */
  readonly trailing?: ReactNode;
}

/**
 * A non-interactive menu header row — visually and structurally an
 * `Entry` (so it aligns with `MenuItem` rows below it for free: same
 * height, same horizontal inset, same `trailing`-pinned-right layout via
 * `Entry`'s own `flex: 1` content column), but deliberately NOT a
 * `MenuItem`. A title isn't a choice a user makes: no `role="menuitem"`,
 * no `id` participating in `useMenuKeyboard`'s roving-active-item
 * bookkeeping, no click handler, no hover highlight. `Entry`'s own
 * default behavior already gives this for free — `role`/`tabIndex`
 * default to `undefined` and the `entry-interactive`/hover-background
 * class never applies when no `onClick` prop is passed — so this
 * component is deliberately a thin wrapper, not a parallel
 * reimplementation of anything `MenuItem` already owns.
 */
export function MenuGroupTitle({ children, trailing }: MenuGroupTitleProps) {
  return (
    <Entry className="menu__group-title" trailing={trailing}>
      {children}
    </Entry>
  );
}
