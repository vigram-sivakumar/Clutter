import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface ControlsProps {
  isSidebarVisible: boolean;
  onToggleSidebarVisible(): void;
}

/**
 * The sidebar-toggle button's backing state is Workspace.isSidebarVisible
 * (ADR-021, M4). The history (back/forward) buttons ADR-027 wired here now
 * render in PageTopBar instead — that move relocated the buttons only, and
 * left their backing state where ADR-027 put it (Workspace's
 * navigation-history stacks, NavigationRouter.back()/forward()).
 *
 * The create buttons below remain placeholders — unlike the history buttons
 * before ADR-027, they are deliberately *not* disabled, since no backing
 * state exists yet to derive a disabled condition from.
 */
export function Controls({
  isSidebarVisible,
  onToggleSidebarVisible,
}: ControlsProps) {
  return (
    <div className="controls" data-tauri-drag-region>
      <div className="sidebar-toggle">
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          // There is no active state for the sidebar-toggle button, as it is a toggle button that controls the visibility of the sidebar. The button's appearance does not change based on the sidebar's visibility, so we use aria-pressed to indicate its state instead.
          aria-pressed={isSidebarVisible}
          onClick={onToggleSidebarVisible}
        >
          <AppIcon icon="sidebar" />
        </Button>
      </div>
      <div className="create-controls">
        <Button isIconOnly size="medium" variant="ghost" onClick={() => {}}>
          <AppIcon icon="plus" />
        </Button>
        <Button
          className="create-dropdown"
          isIconOnly
          size="medium"
          variant="ghost"
          onClick={() => {}}
        >
          <AppIcon icon="caretDown" size={12} />
        </Button>
      </div>
    </div>
  );
}
