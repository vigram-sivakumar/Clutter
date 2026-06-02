import { useEffect, useRef, useState } from 'react';

import '../styles/sidebar-tabs.css';
import { CustomIcons, type ClutterIcon } from '../design-system/icons';
import { Button } from './Button';
export type SidebarTabId =
  | 'notes'
  | 'journals'
  | 'tasks'
  | 'tags';

// Sidebar tab configuration.
// Keep this as the single source of truth for tabs.
const TABS: {
  id: SidebarTabId;
  label: string;
  icon: ClutterIcon;
}[] = [
  {
    id: 'notes',
    label: 'Notes',
    icon: CustomIcons.Note,
  },
  {
    id: 'journals',
    label: 'Journals',
    icon: CustomIcons.CalendarBlank,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CustomIcons.SquareCheckOutline,
  },
  {
    id: 'tags',
    label: 'Tags',
    icon: CustomIcons.Tag,
  },
];

type SidebarTabsProps = {
  value: SidebarTabId;
  onValueChange: (id: SidebarTabId) => void;
};

export function SidebarTabs({ value, onValueChange }: SidebarTabsProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // Stores the active tab width and x-position.
  // Used by the sliding active indicator.
  const [indicatorStyle, setIndicatorStyle] = useState({
    width: 0,
    x: 0,
  });
  // Measure the active tab whenever selection changes.
  // This keeps the sliding indicator perfectly aligned.
  useEffect(() => {
    const rail = railRef.current;

    if (!rail) return;

    const activeTab = rail.querySelector(
      '.clutter-btn--active'
    ) as HTMLElement | null;

    if (!activeTab) return;
    setIndicatorStyle({
      width: activeTab.offsetWidth,
      x: activeTab.offsetLeft,
    });
  }, [value]);
  return (
    <div className="clutter-sidebar-tabs">
      <div ref={railRef} className="clutter-sidebar-tabs__rail">
        {/* Shared sliding surface for the active tab. */}
        <div
          className="clutter-sidebar-tabs__active-indicator"
          // Animate using measured left + width values
          // so the indicator stays perfectly aligned.
          style={{
            width: indicatorStyle.width,
            left: indicatorStyle.x,
          }}
        />
        {/* Render tab buttons from the config above. */}
        {TABS.map((tab) => {
          const active = value === tab.id;
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              iconOnly={Icon}
              aria-label={tab.label}
              active={active}
              className={[
                'clutter-sidebar-tabs__tab',
                active ? 'clutter-sidebar-tabs__tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onValueChange(tab.id)}
            ></Button>
          );
        })}
      </div>
      {/* <Button
        className="clutter-sidebar-tabs__search"
        variant="secondary"
        iconOnly={CustomIcons.MagnifyingGlass}
        aria-label="Search"
      /> */}
    </div>
  );
}
