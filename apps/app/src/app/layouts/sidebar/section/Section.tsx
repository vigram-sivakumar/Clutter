import { Header, type HeaderProps } from './Section.Header';
import './Section.css';

export interface SectionProps extends HeaderProps {
  children?: React.ReactNode;
  hasHeader?: boolean;
  isExpanded?: boolean;
  // Whether the section currently has nothing to show. Computed by the
  // caller from its own data, same reasoning as FavoritesSection's isEmpty —
  // what counts as "empty" differs per consumer. An empty section defaults
  // to collapsed regardless of whatever expand/collapse state happens to be
  // stored for it (e.g. a section defaults to "expanded" per
  // Workspace.isSectionExpanded even though it's never been toggled).
  isEmpty?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function Section({
  children,
  hasHeader,
  isExpanded = true,
  isEmpty = false,
  onExpandedChange,
  ...headerProps
}: SectionProps) {
  const effectiveExpanded = isEmpty ? false : isExpanded;

  return (
    <div className={`section ${effectiveExpanded && 'section--expanded'}`}>
      {hasHeader && (
        <Header
          {...headerProps}
          isExpanded={effectiveExpanded}
          onExpandToggle={() => onExpandedChange?.(!effectiveExpanded)}
        />
      )}
      {effectiveExpanded && <div className="section__content">{children}</div>}
    </div>
  );
}
