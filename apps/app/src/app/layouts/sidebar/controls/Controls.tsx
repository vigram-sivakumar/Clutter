import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { Overlay } from '@components/overlay/Overlay';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
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
 * The create controls are a launcher, not a second creation system: `+` is
 * the fast path (New note, immediately), the chevron opens the menu of every
 * standalone creation type. Every handler is the same action the matching
 * sidebar panel entry point calls — see Sidebar.tsx for the wiring. Nothing
 * here creates anything itself, and nothing switches the active sidebar tab.
 */
interface ControlsProps {
  readonly onNewNote: () => void;
  readonly onNewTask: () => void;
  readonly onNewFolder: () => void;
  readonly onNewTag: () => void;
  readonly onNewTemplate: () => void;
}

export function Controls({
  onNewNote,
  onNewTask,
  onNewFolder,
  onNewTag,
  onNewTemplate,
}: ControlsProps) {
  const menu = useOverlay<HTMLButtonElement>();
  // The chosen action's own surface (a dialog's field, a new draft's editor) takes focus; the menu
  // must not hand it back to the chevron. Overlay consumes the flag on each close, so it is set
  // again by every choice (Escape and outside clicks still restore focus to the chevron).
  const suppressReturnFocusRef = useRef(false);

  const choose = (action: () => void) => (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    suppressReturnFocusRef.current = true;
    menu.hide();
    action();
  };

  return (
    <div className="controls" data-tauri-drag-region>
      <div className="create-controls">
        <Button isIconOnly size="medium" variant="ghost" aria-label="New note" onClick={onNewNote}>
          <AppIcon icon="plus" />
        </Button>
        <Button
          ref={menu.anchorRef}
          className="create-dropdown"
          isIconOnly
          size="medium"
          variant="ghost"
          isActive={menu.open}
          aria-label="Create"
          aria-haspopup="menu"
          aria-expanded={menu.open}
          onClick={menu.toggle}
        >
          <AppIcon icon="caretDown" size={12} />
        </Button>
      </div>

      <Overlay
        open={menu.open}
        onClose={menu.hide}
        anchorRef={menu.anchorRef}
        side="bottom"
        alignment="start"
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <Menu size="medium">
          <MenuItem leading={<AppIcon icon="note" />} onClick={choose(onNewNote)}>
            New note
          </MenuItem>
          <MenuItem leading={<AppIcon icon="squareCheckOutline" />} onClick={choose(onNewTask)}>
            New task
          </MenuItem>
          <MenuItem leading={<AppIcon icon="folder" />} onClick={choose(onNewFolder)}>
            New folder
          </MenuItem>
          <MenuItem leading={<AppIcon icon="tag" />} onClick={choose(onNewTag)}>
            New tag
          </MenuItem>
          <div className="menu__divider" role="separator" />
          <MenuItem leading={<AppIcon icon="template" />} onClick={choose(onNewTemplate)}>
            New template
          </MenuItem>
        </Menu>
      </Overlay>
    </div>
  );
}
