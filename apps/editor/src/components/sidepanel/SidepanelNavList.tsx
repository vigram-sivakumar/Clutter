import { CustomIcons, type ClutterIcon } from '../../design-system/icons';
import { type TabId } from '../Tabs';

import { NavItem } from './NavItem';

/**
 * Set `true` to make nav rows inert (aria-disabled, `empty` icon) until routes exist.
 * Default: interactive — not disabled.
 */
const NAV_INERT = false;

type NavRow = {
  label: string;
  icon: ClutterIcon;
  iconSize?: number;
};

/**
 * Top navigation slot only — Figma Clutter-Notes (node 527:16717).
 * "Start your day…", Favorites, Folders, Today, etc. sit in the content region below the divider.
 */

const CALENDAR_NAV: NavRow[] = [
  { label: 'All Days', icon: CustomIcons.CalendarBlank },
  { label: 'My Templates', icon: CustomIcons.Template },
];

const NOTES_NAV: NavRow[] = [
  { label: 'All Notes', icon: CustomIcons.Note },
  { label: 'Inbox', icon: CustomIcons.Tray },
];

const TASKS_NAV: NavRow[] = [
  { label: 'All Tasks', icon: CustomIcons.SquareCheckOutline },
  { label: 'Someday', icon: CustomIcons.Tray },
];

const TAGS_NAV: NavRow[] = [
  { label: 'All Tags', icon: CustomIcons.Tag },
  { label: 'Untagged', icon: CustomIcons.CircleDashed },
];

const NAV_BY_TAB: Record<TabId, NavRow[]> = {
  calendar: CALENDAR_NAV,
  notes: NOTES_NAV,
  tasks: TASKS_NAV,
  tags: TAGS_NAV,
};

export type SidepanelNavListProps = {
  activeTab: TabId;
};

/**
 * {@link NavigationItem} rows for the active tab (row count varies by tab per Figma).
 */
export function SidepanelNavList({ activeTab }: SidepanelNavListProps) {
  const rows = NAV_BY_TAB[activeTab] ?? [];

  return (
    <div className="clutter-sidepanel-nav-list">
      <div className="clutter-sidepanel-nav-list__list">
        {rows.map((row) => (
          <NavItem
            key={row.label}
            label={row.label}
            icon={row.icon}
            iconSize={row.iconSize}
            type="button"
            {...(NAV_INERT
              ? {
                  empty: true,
                  "aria-disabled": true as const,
                  tabIndex: -1 as const,
                }
              : {})}
          />
        ))}
      </div>
    </div>
  );
}
