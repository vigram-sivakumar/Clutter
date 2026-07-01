import { Entry, type EntryProps } from '../sidebar/Entry';
import { Checkbox } from '../Checkbox';
import { Caret } from '../Caret';
import { Button } from '../Button';
import { Icons } from '../../design-system/icons';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;

  isEmpty?: boolean;
  isExpanded?: boolean;
  isChecked: boolean;

  onExpandToggle?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}

export function Task({
  title,
  isChecked,
  isExpanded = false,
  isEmpty = false,
  onExpandToggle,
  onCheckedChange,
  ...entryProps
}: TaskProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <>
          <Caret
            isPlaceholder={isEmpty}
            isExpanded={isExpanded}
            variant="tree"
          />
          <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
        </>
      }
      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      <span className={isChecked ? 'is-completed' : undefined}>{title}</span>
    </Entry>
  );
}
