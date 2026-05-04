import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';

import { Icons } from '../../design-system/icons';
import type { TabId } from '../Tabs';
import { SidepanelNavigation } from './Navigation';

/**
 * List destinations are not wired yet; keep rows visible but inert so we do not
 * offer empty navigation targets.
 */
const NAV_DISABLED = true;

type NavRow = {
  label: string;
  icon: PhosphorIcon;
  iconSize?: number;
  iconWeight?: IconProps['weight'];
};

/**
 * Top navigation slot only — Figma Clutter-Notes (node 527:16717).
 * "Start your day…", Favorites, Folders, Today, etc. sit in the content region below the divider.
 */

const CALENDAR_NAV: NavRow[] = [
  { label: 'All Days', icon: Icons.Calendar },
  { label: 'My Templates', icon: Icons.Table },
];

const NOTES_NAV: NavRow[] = [
  { label: 'All Notes', icon: Icons.Note },
  { label: 'Inbox', icon: Icons.Tray },
];

const TASKS_NAV: NavRow[] = [
  { label: 'All Tasks', icon: Icons.CheckCircle },
  { label: 'Inbox', icon: Icons.Tray },
];

const TAGS_NAV: NavRow[] = [
  { label: 'All Tags', icon: Icons.Tag },
  { label: 'Untagged', icon: Icons.CircleDashed },
];

const NAV_BY_TAB: Record<TabId, NavRow[]> = {
  calendar: CALENDAR_NAV,
  notes: NOTES_NAV,
  tasks: TASKS_NAV,
  tags: TAGS_NAV,
};

export type SidepanelTabNavProps = {
  activeTab: TabId;
};

/**
 * {@link SidepanelNavigation} rows for the active tab (row count varies by tab per Figma).
 */
export function SidepanelTabNav({ activeTab }: SidepanelTabNavProps) {
  const rows = NAV_BY_TAB[activeTab];

  return (
    <div className="clutter-sidepanel-tab-nav">
      <div className="clutter-sidepanel-tab-nav__list">
        {rows.map((row) => (
          <SidepanelNavigation
            key={row.label}
            label={row.label}
            icon={row.icon}
            iconSize={row.iconSize}
            iconWeight={row.iconWeight}
            type="button"
            disabled={NAV_DISABLED}
          />
        ))}
      </div>
    </div>
  );
}
