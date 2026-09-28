import { useRef } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { AppIcon } from '@shared/icon';
import type { TaskDisplayConfig } from '../helpers/groupTasks';

export interface TasksSectionSettingsMenuProps {
  readonly config: TaskDisplayConfig;
  readonly onConfigChange: (next: TaskDisplayConfig) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The Tasks sidebar's per-section "settings" action — lives in the Today/
 * Everything else `Section` header's `actions` slot (hover-revealed, the
 * same `Entry`/`.entry__actions` mechanism Folder.tsx's "+" button and
 * Note.tsx's overflow-menu trigger already use), and opens a small,
 * two-item tick-selection menu (Show completed / Auto-sort completed) —
 * the same `Button` + `Overlay` + `Menu`/`MenuItem` tick pattern
 * CollectionViewMenu.tsx's Properties submenu already establishes: a
 * leading tick icon (or an empty, same-sized placeholder) marks each
 * independently-toggleable setting, never a checkbox/radio control.
 * Unlike that Properties submenu, selecting either item here closes the
 * menu (`onOpenChange(false)`, alongside `onConfigChange`) — a deliberate
 * product choice for this menu, not a shared convention with it.
 *
 * `config`/`onConfigChange` are the one shared Tasks-view preference —
 * this component is mounted once per section (Today, Everything else),
 * but both instances read and write the exact same `config` object, so
 * toggling either setting from either section changes it everywhere.
 * `open`/`onOpenChange` are owned by the caller (not local state) because
 * the caller also needs to know whether this section's own menu is open,
 * to force the section header to stay visibly hovered while it is (see
 * Note.tsx/Folder.tsx's identical `forceHover` reasoning).
 */
export function TasksSectionSettingsMenu({
  config,
  onConfigChange,
  open,
  onOpenChange,
}: TasksSectionSettingsMenuProps) {
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
        <AppIcon icon="configure" />
      </Button>
      <Overlay
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
      >
        <Menu size="medium">
          <MenuItem
            leading={
              config.showCompleted ? <AppIcon icon="tick" /> : <span className="app-icon" />
            }
            onClick={(event) => {
              event.stopPropagation();
              onConfigChange({ ...config, showCompleted: !config.showCompleted });
              onOpenChange(false);
            }}
          >
            Show completed
          </MenuItem>
          <MenuItem
            leading={
              config.autoSortCompleted ? <AppIcon icon="tick" /> : <span className="app-icon" />
            }
            onClick={(event) => {
              event.stopPropagation();
              onConfigChange({ ...config, autoSortCompleted: !config.autoSortCompleted });
              onOpenChange(false);
            }}
          >
            Auto-sort completed
          </MenuItem>
        </Menu>
      </Overlay>
    </>
  );
}
