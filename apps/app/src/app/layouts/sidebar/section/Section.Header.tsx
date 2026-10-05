import { Caret } from '@components/caret/Caret';
import { Entry, EntryProps } from '@components/entry/Entry';
import './Section.Header.css';

export interface HeaderProps extends Omit<EntryProps, 'children'> {
  title?: string;
  actions?: React.ReactNode;

  isCollapsible?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  /**
   * Makes the whole header row the expand/collapse control (click, or
   * Enter/Space) instead of navigating — any `onClick` passed in
   * `entryProps` is superseded. The caret and `actions` keep their own
   * clicks (Entry ignores clicks that land on a nested button).
   */
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
  const toggleProps =
    isTitleToggle && onExpandToggle
      ? {
          onClick: onExpandToggle,
          ...(isCollapsible && { 'aria-expanded': isExpanded }),
        }
      : {};

  return (
    <Entry
      className="section-header"
      {...entryProps}
      {...toggleProps}
      actions={actions}
    >
      <div
        className={`section-header__content${isTitleToggle ? ' section-header__content-toggle' : ''}`}
      >
        <span className="section-header__title">{title}</span>

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
