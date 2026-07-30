import type { ReactNode } from 'react';
import './Page.TopBar.css';

interface PageTopBarProps {
  breadcrumbs?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
}

export function PageTopBar({ breadcrumbs, menu, actions }: PageTopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar--leading">{breadcrumbs}</div>
      {menu && <div className="topbar--menu">{menu}</div>}
      <div className="topbar--trailing">{actions}</div>
    </div>
  );
}
