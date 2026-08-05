import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface ControlsProps {
  isSidebarVisible: boolean;
  onToggleSidebarVisible(): void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack(): void;
  onNavigateForward(): void;
}

/**
 * The sidebar-toggle button's backing state is Workspace.isSidebarVisible
 * (ADR-021, M4). The history (back/forward) buttons' backing state is
 * Workspace's navigation-history stacks, and their handlers are
 * NavigationRouter.back()/forward() (ADR-027) — no longer the disabled
 * placeholders ADR-016 kept them as.
 */
export function Controls({
  isSidebarVisible,
  onToggleSidebarVisible,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
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
      <div className="history-controls">
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          disabled={!canNavigateBack}
          onClick={onNavigateBack}
        >
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          disabled={!canNavigateForward}
          onClick={onNavigateForward}
        >
          <AppIcon icon="arrowRight" />
        </Button>
      </div>
    </div>
  );
}
