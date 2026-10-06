import { useRef } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon } from '@shared/icon';
import { TASK_GROUP_IDS, type TaskDisplayConfig, type TaskGroupId } from '../helpers/groupTasks';

const GROUP_LABELS: Record<TaskGroupId, string> = {
  today: 'Today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
};

export interface TasksViewSettingsMenuProps {
  readonly config: TaskDisplayConfig;
  readonly onConfigChange: (next: TaskDisplayConfig) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The Tasks view's global settings action — lives once, on the Tasks
 * sidebar's "All Tasks" row (TasksShortcuts.tsx), in that row's
 * always-visible `trailing` slot rather than its hover-revealed `actions`
 * slot, so the view's configurability is discoverable without hovering.
 * Deliberately not on any individual group header (Today/Overdue/
 * Upcoming): both settings apply to every group at once, and placing the
 * control on one group misrepresented that scope.
 *
 * Opens a tick-selection menu — a "Groups" section (Today / Overdue /
 * Upcoming / Unscheduled, which sidebar sections are shown), a divider,
 * then Show completed / Auto-sort completed — the same `Button` + `Overlay`
 * + `Menu`/`MenuItem` tick pattern CollectionViewMenu.tsx's Properties
 * submenu establishes, with the tick in the item's trailing slot (absent
 * when off). Like that submenu, toggling an item leaves the menu open so
 * several can be changed in one visit; it closes on outside click/Escape.
 *
 * `config`/`onConfigChange` are the one shared Tasks-view preference
 * (owned by AppLayout). `open`/`onOpenChange` are owned by the caller (not
 * local state) because the caller also needs to know whether the menu is
 * open, to keep its row visibly hovered while it is (see Note.tsx/
 * Folder.tsx's identical `forceHover` reasoning).
 */
export function TasksViewSettingsMenu({
  config,
  onConfigChange,
  open,
  onOpenChange,
}: TasksViewSettingsMenuProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={anchorRef}
        size="small"
        variant="ghost"
        interaction="subtle"
        isIconOnly
        aria-label="Task display settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <AppIcon icon="settings" />
      </Button>
      <Overlay
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
      >
        <Menu size="medium">
          <MenuGroupTitle>Groups</MenuGroupTitle>
          {TASK_GROUP_IDS.map((id) => {
            const hidden = config.hiddenGroups ?? [];
            const isShown = !hidden.includes(id);
            return (
              <MenuItem
                key={id}
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
          <MenuItem
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
            Auto-sort completed
          </MenuItem>
        </Menu>
      </Overlay>
    </>
  );
}
