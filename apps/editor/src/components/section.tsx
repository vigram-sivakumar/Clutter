import { SectionHeader } from './items/SectionHeader';
import '../styles/section.css';

interface SectionProps {
  title?: string;
  children?: React.ReactNode;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function Section({
  title,
  children,
  expanded,
  onExpandedChange,
}: SectionProps) {
  return (
    <div className="section">
      <div className="section__header">
        <SectionHeader
          title={title}
          isCollapsible
          isExpanded={expanded}
          onExpandToggle={() => onExpandedChange?.(!expanded)}
        />
      </div>
      <div className="section__content">{children}</div>
    </div>
  );
}
