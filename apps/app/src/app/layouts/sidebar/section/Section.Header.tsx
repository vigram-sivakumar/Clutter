import { Caret } from '@components/caret/Caret';
import { Entry, EntryProps } from '@components/entry/Entry';
import './Section.Header.css';

export interface HeaderProps extends Omit<EntryProps, 'children'> {
  title?: string;
  actions?: React.ReactNode;

  isCollapsible?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  isTitleToggle?: boolean;
}

export function Header({
  title,
  actions,
  isCollapsible = false,
  isExpanded = false,
  onExpandToggle,
  isTitleToggle = false,
  ...entryProps
}: HeaderProps) {
  // Treat the title as a button only when it toggles the section.
  const titleProps =
    isTitleToggle && onExpandToggle
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: onExpandToggle,
        }
      : {};

  return (
    <Entry className="section-header" {...entryProps} actions={actions}>
      <div className="section-header__toggle">
        <span className="section-header__title" {...titleProps}>
          {title}
        </span>

        {isCollapsible && (
          <Caret
            className="section-header__caret"
            variant="dropdown"
            isExpanded={isExpanded}
            onClick={onExpandToggle}
          />
        )}
      </div>
    </Entry>
  );
}
