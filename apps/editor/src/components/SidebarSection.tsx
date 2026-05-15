import type { ReactNode } from 'react';

import '../styles/sidebar-section.css';

type SidebarSectionProps = {
  children?: ReactNode;
};

export function SidebarSection({ children }: SidebarSectionProps) {
  return <div className="clutter-sidebar-section">{children}</div>;
}
