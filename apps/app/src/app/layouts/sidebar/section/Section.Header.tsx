import { Caret } from '@components/caret/Caret';
import { Entry, EntryProps } from '@app/layouts/sidebar/entry/Entry';

export interface HeaderProps extends Omit<EntryProps, 'children'> {
  title?: string;
  actions?: React.ReactNode;

  isCollapsible?: boolean;
  isExpanded?: boolean;

  onExpandToggle?: () => void;
}

export function Header({
  title,
  actions,
  isCollapsible = false,
  isExpanded = false,
  onExpandToggle,
  ...entryProps
}: HeaderProps) {
  return (
    <Entry {...entryProps} actions={actions}>
      <span className="section-header"> {title}</span>

      {isCollapsible && (
        <span className="section-header__caret">
          <Caret
            variant="dropdown"
            isExpanded={isExpanded}
            onClick={onExpandToggle}
          />
        </span>
      )}
    </Entry>
  );
}
