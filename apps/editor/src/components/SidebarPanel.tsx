import type { ReactNode } from 'react';

import '../styles/sidebar-panel.css';

type SidebarPanelProps = {
  header?: ReactNode;
  children?: ReactNode;
};

export function SidebarPanel({ header, children }: SidebarPanelProps) {
  return (
    <div className="clutter-sidebar-panel">
      <div className="clutter-sidebar-panel__header">{header}</div>
      <div className="clutter-sidebar-panel__divider"></div>
      <div className="clutter-sidebar-panel__content">{children}</div>
    </div>
  );
}
