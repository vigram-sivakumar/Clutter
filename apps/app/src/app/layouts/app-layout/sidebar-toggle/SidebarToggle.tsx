import './SidebarToggle.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface SidebarToggleProps {
  isSidebarVisible: boolean;
  onToggleSidebarVisible(): void;
}

/**
 * The one sidebar collapse/expand control — moved here from Controls
 * (formerly rendered inline inside .sidebar) so it can be positioned
 * independently of both the sidepanel (covered and non-interactive while
 * collapsed) and the page (the layer that slides). Rendered once, as a
 * sibling of .app-layout__sidepanel/.app-layout__page in AppLayout.tsx —
 * not duplicated per state. SidebarToggle.css repositions this single
 * instance via [data-sidebar-collapsed]: expanded, absolute coordinates
 * matching where Controls used to render it inline in the sidebar's own
 * top-left corner; collapsed, a stationary overlay anchored to
 * .app-layout itself, unaffected by the page sliding underneath it.
 */
export function SidebarToggle({ isSidebarVisible, onToggleSidebarVisible }: SidebarToggleProps) {
  return (
    <div className="sidebar-toggle" data-tauri-drag-region>
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
  );
}
