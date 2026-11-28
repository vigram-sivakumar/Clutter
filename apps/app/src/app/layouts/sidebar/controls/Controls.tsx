import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { useRef } from 'react';

/**
 * The sidebar-toggle button that used to render here moved to
 * AppLayout's SidebarToggle (app-layout/sidebar-toggle/SidebarToggle.tsx)
 * — it needs to be positioned independently of the sidebar once
 * collapsed, which this component's own flex flow can't do. The history
 * (back/forward) buttons ADR-027 wired here now render in PageTopBar
 * instead — that move relocated the buttons only, and left their backing
 * state where ADR-027 put it (Workspace's navigation-history stacks,
 * NavigationRouter.back()/forward()).
 *
 * The Create button is a launcher, not a second creation system: it opens
 * the menu of every standalone creation type. Every handler is the same action the matching
 * sidebar panel entry point calls — see Sidebar.tsx for the wiring. Nothing
 * here creates anything itself, and nothing switches the active sidebar tab.
 */
interface ControlsProps {
  readonly onOpenSearch: () => void;
  readonly onNewNote: () => void;
  readonly onOpenDailyNote: () => void;
  readonly onNewTask: () => void;
  readonly onNewFolder: () => void;
  readonly onNewTag: () => void;
  readonly onNewTemplate: () => void;
  readonly onUpload: () => void;
}

export function Controls({
  onOpenSearch,
  onNewNote,
  onOpenDailyNote,
  onNewTask,
  onNewFolder,
  onNewTag,
  onNewTemplate,
  onUpload,
}: ControlsProps) {
  const menu = useOverlay<HTMLButtonElement>();
  // The chosen action's own surface (a dialog's field, a new draft's editor) takes focus; the menu
  // must not hand it back to the Create button. Overlay consumes the flag on each close, so it is set
  // again by every choice (Escape and outside clicks still restore focus to the Create button).
  const suppressReturnFocusRef = useRef(false);

  const choose =
    (action: () => void) => (event: { stopPropagation(): void }) => {
      event.stopPropagation();
      suppressReturnFocusRef.current = true;
      menu.hide();
      action();
    };

  return (
    <div className="controls" data-tauri-drag-region>
      <Button
        isIconOnly
        size="medium"
        variant="ghost"
        aria-label="Search"
        onClick={onOpenSearch}
      >
        <AppIcon icon={getSystemLocationPresentation('search').icon} />
      </Button>
      <Button
        ref={menu.anchorRef}
        isIconOnly
        size="medium"
        variant="ghost"
        isActive={menu.open}
        aria-label="Create"
        title="Create"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={menu.toggle}
      >
        <AppIcon icon="notePencil" />
      </Button>

      <Overlay
        open={menu.open}
        onClose={menu.hide}
        anchorRef={menu.anchorRef}
        side="bottom"
        alignment="start"
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <Menu size="medium">
          <MenuGroupTitle>Create new</MenuGroupTitle>
          <MenuItem
            leading={<AppIcon icon="note" />}
            onClick={choose(onNewNote)}
          >
            Note
          </MenuItem>
          <MenuItem
            leading={
              <AppIcon
                icon={getSystemLocationPresentation('daily-notes').icon}
              />
            }
            onClick={choose(onOpenDailyNote)}
          >
            Today’s daily note
          </MenuItem>
          <MenuItem
            leading={<AppIcon icon="circleTick" />}
            onClick={choose(onNewTask)}
          >
            Task
          </MenuItem>
          <MenuItem
            leading={<AppIcon icon="folder" />}
            onClick={choose(onNewFolder)}
          >
            Folder
          </MenuItem>
          <MenuItem leading={<AppIcon icon="tag" />} onClick={choose(onNewTag)}>
            Tag
          </MenuItem>
          <div className="menu__divider" role="separator" />
          <MenuItem
            leading={<AppIcon icon="template" />}
            onClick={choose(onNewTemplate)}
          >
            Template
          </MenuItem>
          <MenuItem
            leading={<AppIcon icon="upload" />}
            onClick={choose(onUpload)}
          >
            Upload
          </MenuItem>
        </Menu>
      </Overlay>
    </div>
  );
}
