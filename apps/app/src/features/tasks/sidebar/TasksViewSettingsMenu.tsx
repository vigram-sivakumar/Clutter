import type { RefObject } from 'react';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { HIDEABLE_TASK_GROUP_IDS, type TaskDisplayConfig, type TaskGroupId } from '../helpers/groupTasks';

const GROUP_LABELS: Record<TaskGroupId, string> = {
  today: 'Today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
};

// Today/Upcoming/Unscheduled match the Tasks navigation's icons. There is no alarm icon in the
// registry yet, so Overdue uses `exclamation` as a stand-in.
const GROUP_ICONS: Record<TaskGroupId, SystemIcon> = {
  today: 'calendarToday',
  overdue: 'exclamation',
  upcoming: 'calendarDots',
  unscheduled: 'calendar',
};

export interface TasksViewSettingsMenuProps {
  /** The Options sidebar row the menu is anchored to (to its right, top-aligned — like Tags' Tidy up menu). */
  readonly anchorRef: RefObject<HTMLElement>;
  readonly config: TaskDisplayConfig;
  readonly onConfigChange: (next: TaskDisplayConfig) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The menu behind the Tasks sidebar's "Options" row (TasksShortcuts.tsx) —
 * the Tasks equivalent of Tags' Tidy up menu: same `Overlay` + `Menu`
 * primitives, opening to the right of its row, top-aligned. It is a sidebar
 * action, not a header button; both settings apply to every group at once.
 *
 * A "Groups" section (Overdue / Upcoming / Unscheduled — Today is always shown —
 * which sidebar sections are shown), a divider, then a "Display" section (Show
 * completed / Sort completed) — the tick pattern CollectionViewMenu.tsx's
 * Properties submenu establishes, with the tick in the item's trailing slot
 * (absent when off). Toggling an item leaves the menu open so several can
 * be changed in one visit; it closes on outside click/Escape.
 *
 * `config`/`onConfigChange` are the one shared Tasks-view preference
 * (owned by AppLayout). `open`/`onOpenChange` are owned by the caller (not
 * local state) because the caller also keeps its row selected while the
 * menu is open.
 */
export function TasksViewSettingsMenu({
  anchorRef,
  config,
  onConfigChange,
  open,
  onOpenChange,
}: TasksViewSettingsMenuProps) {
  return (
      <Overlay
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={anchorRef}
        side="right"
        alignment="start"
      >
        <Menu size="medium">
          <MenuGroupTitle>Groups</MenuGroupTitle>
          {HIDEABLE_TASK_GROUP_IDS.map((id) => {
            const hidden = config.hiddenGroups ?? [];
            const isShown = !hidden.includes(id);
            return (
              <MenuItem
                key={id}
                leading={<AppIcon icon={GROUP_ICONS[id]} />}
                trailing={
                  isShown ? <AppIcon icon="tick" className="menu__item-indicator" /> : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onConfigChange({
                    ...config,
                    hiddenGroups: isShown ? [...hidden, id] : hidden.filter((h) => h !== id),
                  });
                }}
              >
                {GROUP_LABELS[id]}
              </MenuItem>
            );
          })}
          <div className="menu__divider" role="separator" />
          <MenuGroupTitle>Display</MenuGroupTitle>
          <MenuItem
            leading={<AppIcon icon="circleTick" />}
            trailing={
              config.showCompleted ? (
                <AppIcon icon="tick" className="menu__item-indicator" />
              ) : undefined
            }
            onClick={(event) => {
              event.stopPropagation();
              onConfigChange({ ...config, showCompleted: !config.showCompleted });
            }}
          >
            Show completed
          </MenuItem>
          <MenuItem
            leading={<AppIcon icon="arrowDown" />}
            trailing={
              config.autoSortCompleted ? (
                <AppIcon icon="tick" className="menu__item-indicator" />
              ) : undefined
            }
            onClick={(event) => {
              event.stopPropagation();
              onConfigChange({ ...config, autoSortCompleted: !config.autoSortCompleted });
            }}
          >
            Sort completed
          </MenuItem>
        </Menu>
      </Overlay>
  );
}
