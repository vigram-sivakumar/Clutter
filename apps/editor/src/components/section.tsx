import type { ReactNode } from 'react';

import { InteractiveItem } from './InteractiveItem';
import '../styles/section.css';

export type SectionProps = {
  /** When set, renders the section header row. Omit for a headerless section. */
  title?: string;
  children?: ReactNode;
  className?: string;
  /** When true and title is set, header shows chevron and body toggles. Default false. */
  collapsible?: boolean;
  isExpanded?: boolean;
  /** Expands/collapses the section body; wired to the header chevron only. */
  onToggle?: () => void;
  /** Header row click (e.g. navigate to a dedicated page). Does not toggle expand. */
  onClick?: () => void;
  /** Selected nav destination for this section header. Independent of isExpanded. */
  active?: boolean;
  /** When false and body is visible, shows emptyMessage instead of children. Default false. */
  hasGroups?: boolean;
  emptyMessage?: string;
};

export function Section({
  title,
  children,
  className,
  collapsible = false,
  isExpanded = false,
  onToggle,
  onClick,
  active = false,
  hasGroups = false,
  emptyMessage,
}: SectionProps) {
  const showHeader = title !== undefined && title !== '';
  const isCollapsible = showHeader && collapsible;

  const sectionClassName = [
    'clutter-section',
    isCollapsible && isExpanded && 'clutter-section--expanded',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showBody = isCollapsible ? isExpanded : true;

  const bodyContent = hasGroups ? (
    children
  ) : emptyMessage ? (
    <InteractiveItem variant="placeholder">
      <span className="interactive-item__label">{emptyMessage}</span>
    </InteractiveItem>
  ) : null;

  return (
    <div className={sectionClassName}>
      {showHeader && (
        <InteractiveItem
          variant="header"
          active={active}
          onClick={onClick}
          isExpanded={isExpanded}
          onExpandToggle={isCollapsible ? onToggle : undefined}
        >
          <span className="interactive-item__label">{title}</span>
        </InteractiveItem>
      )}

      {showBody && <div className="clutter-section__body">{bodyContent}</div>}
    </div>
  );
}

export type GroupProps = {
  children?: ReactNode;
  className?: string;
  subheader?: string;
};

export function Group({ children, className, subheader }: GroupProps) {
  const groupClassName = ['clutter-section-group', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={groupClassName}>
      {subheader && (
        <InteractiveItem variant="subheader">
          <span className="interactive-item__label">{subheader}</span>
        </InteractiveItem>
      )}
      {children}
    </div>
  );
}
