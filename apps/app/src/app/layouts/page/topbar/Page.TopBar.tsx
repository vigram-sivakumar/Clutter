import { ReactNode } from 'react';
import './Page.TopBar.css';
import { Breadcrumbs, type Breadcrumb } from '@components/breadcrumb/Breadcrumbs';

interface PageTopBarProps {
  breadcrumbs: Breadcrumb[];
  trailing?: ReactNode;
}

export function PageTopBar({ breadcrumbs, trailing }: PageTopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar--leading">
        <Breadcrumbs items={breadcrumbs} />
      </div>
      <div className="topbar--trailing">{trailing}</div>
    </div>
  );
}
