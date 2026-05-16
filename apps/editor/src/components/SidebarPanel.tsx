import type { ReactNode } from 'react';

import { Divider } from './Divider';
import '../styles/sidebar-panel.css';

type SidebarPanelProps = {
  navigation?: ReactNode;
  children?: ReactNode;
};

export function SidebarPanel({ navigation, children }: SidebarPanelProps) {
  return (
    <div className="clutter-sidebar-panel">
      <div className="clutter-sidebar-panel__navigation">{navigation}</div>
      <Divider />
      <div className="clutter-sidebar-panel__content">{children}</div>
    </div>
  );
}
