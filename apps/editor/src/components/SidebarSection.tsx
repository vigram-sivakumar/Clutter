import type { ReactNode } from 'react';

import { InteractiveItem } from './InteractiveItem';
import '../styles/sidebar-section.css';

type SidebarSectionProps = {
  children?: ReactNode;
  title: string;
  className?: string;
  isExpanded?: boolean;
  hasChildren?: boolean;
  emptyMessage?: string;
  onToggle?: () => void;
};

export function SidebarSection({
  children,
  title,
  className,
  isExpanded = false,
  hasChildren = false,
  emptyMessage,
  onToggle,
}: SidebarSectionProps) {
  const sectionClassName = [
    'clutter-sidebar-section',
    isExpanded ? 'clutter-sidebar-section--expanded' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Create header item
  const header = (
    <InteractiveItem
      variant="header"
      active={isExpanded}
      onClick={onToggle}
      isExpanded={isExpanded}
      onExpandToggle={onToggle}
    >
      <span className="interactive-item__label">{title}</span>
    </InteractiveItem>
  );

  // Create placeholder item
  const placeholder = (
    <InteractiveItem variant="placeholder">
      <span className="interactive-item__label">{emptyMessage}</span>
    </InteractiveItem>
  );

  return (
    <div className={sectionClassName}>
      {header}

      {isExpanded && (
        <div className="clutter-sidebar-section__body">
          {hasChildren ? children : placeholder}
        </div>
      )}
    </div>
  );
}

type SidebarGroupProps = {
  children?: ReactNode;
  className?: string;
};

export function SidebarGroup({ children, className }: SidebarGroupProps) {
  const groupClassName = ['clutter-sidebar-group', className]
    .filter(Boolean)
    .join(' ');

  return <div className={groupClassName}>{children}</div>;
}
