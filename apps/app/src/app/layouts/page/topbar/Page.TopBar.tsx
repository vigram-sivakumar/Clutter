import type { ReactNode } from 'react';
import './Page.TopBar.css';

interface PageTopBarProps {
  breadcrumbs?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
}

export function PageTopBar({ breadcrumbs, menu, actions }: PageTopBarProps) {
  return (
    <div className="topbar" data-tauri-drag-region>
      <div className="topbar--leading" data-tauri-drag-region>
        {breadcrumbs}
      </div>
      {menu && <div className="topbar--menu">{menu}</div>}
      <div className="topbar--trailing">{actions}</div>
    </div>
  );
}
