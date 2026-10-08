import type { ReactNode } from 'react';
import './Page.TopBar.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface PageTopBarProps {
  breadcrumbs?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
  /** A notice centered in the bar (the archived banner). */
  banner?: ReactNode;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack(): void;
  onNavigateForward(): void;
}

export function PageTopBar({
  breadcrumbs,
  menu,
  actions,
  banner,
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: PageTopBarProps) {
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar--leading" data-tauri-drag-region>
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
      {banner}
      {menu && <div className="topbar--menu">{menu}</div>}
      <div className="topbar--trailing">{actions}</div>
    </div>
  );
}
