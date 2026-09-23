import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

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
 * The create buttons below remain placeholders — unlike the history buttons
 * before ADR-027, they are deliberately *not* disabled, since no backing
 * state exists yet to derive a disabled condition from.
 */
export function Controls() {
  return (
    <div className="controls" data-tauri-drag-region>
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
