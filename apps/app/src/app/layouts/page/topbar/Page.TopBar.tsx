import type { ReactNode } from 'react';
import './Page.TopBar.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface PageTopBarProps {
  breadcrumbs?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
  /**
   * Same Workspace.isSidebarVisible-backed pair Controls' sidebar-toggle
   * uses (ADR-021, M4) — this button and Controls' both drive the one
   * source of truth, never layout directly. Optional so Page's other
   * tests/callers that don't care about sidebar state aren't forced to
   * supply it.
   */
  isSidebarVisible?: boolean;
  onToggleSidebarVisible?(): void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack(): void;
  onNavigateForward(): void;
}

export function PageTopBar({
  breadcrumbs,
  menu,
  actions,
  isSidebarVisible,
  onToggleSidebarVisible,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: PageTopBarProps) {
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar--leading" data-tauri-drag-region>
        <Button
          className="topbar__sidebar-toggle"
          isIconOnly
          size="medium"
          variant="ghost"
          aria-pressed={isSidebarVisible}
          onClick={onToggleSidebarVisible}
        >
          <AppIcon icon="sidebar" />
        </Button>

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
        {breadcrumbs}
      </div>
      {menu && <div className="topbar--menu">{menu}</div>}
      <div className="topbar--trailing">{actions}</div>
    </div>
  );
}
