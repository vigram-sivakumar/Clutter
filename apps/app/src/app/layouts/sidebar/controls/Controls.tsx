import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface ControlsProps {
  isSidebarVisible: boolean;
  onToggleSidebarVisible(): void;
}

/**
 * History (back/forward) controls remain intentional placeholders — no
 * backing state exists for navigation history yet (ADR-016). The
 * sidebar-toggle button is no longer one: Workspace.isSidebarVisible
 * (ADR-021, M4) is its backing state.
 */
export function Controls({ isSidebarVisible, onToggleSidebarVisible }: ControlsProps) {
  return (
    <div className="controls" data-tauri-drag-region>
      <div className="sidebar-toggle">
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          isActive={isSidebarVisible}
          aria-pressed={isSidebarVisible}
          onClick={onToggleSidebarVisible}
        >
          <AppIcon icon="sidebar" />
        </Button>
      </div>
      <div className="history-controls">
        <Button isIconOnly size="medium" variant="ghost" disabled>
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button isIconOnly size="medium" variant="ghost" disabled>
          <AppIcon icon="arrowRight" />
        </Button>
      </div>
    </div>
  );
}
