import { Header, type HeaderProps } from './Section.Header';
import './Section.css';

export interface SectionProps extends HeaderProps {
  children?: React.ReactNode;
  hasHeader?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function Section({
  children,
  hasHeader,
  isExpanded = true,
  onExpandedChange,
  ...headerProps
}: SectionProps) {
  return (
    <div className={`section ${isExpanded && 'section--expanded'}`}>
      {hasHeader && (
        <Header
          {...headerProps}
          isExpanded={isExpanded}
          onExpandToggle={() => onExpandedChange?.(!isExpanded)}
        />
      )}
      {isExpanded && <div className="section__content">{children}</div>}
    </div>
  );
}
