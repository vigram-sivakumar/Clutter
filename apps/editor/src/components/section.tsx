import { Header } from './entry/Section.Header';
import '../styles/Section.css';

interface SectionProps {
  title?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  isExpanded: boolean;

  onClick?: () => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function Section({
  title,
  actions,
  children,
  isExpanded = true,

  onClick,
  onExpandedChange,
}: SectionProps) {
  return (
    <div className="section">
      <Header
        title={title}
        actions={actions}
        isCollapsible
        isExpanded={isExpanded}
        onClick={onClick}
        onExpandToggle={() => onExpandedChange?.(!isExpanded)}
      />
      {isExpanded && <div className="section__content">{children}</div>}
    </div>
  );
}
