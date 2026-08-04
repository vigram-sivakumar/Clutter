import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import './Task.css';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;
  dueDate?: string;
  isOverdue?: boolean;

  isEmpty?: boolean;
  isExpanded?: boolean;
  isChecked: boolean;

  onExpandToggle?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}

export function Task({
  title,
  dueDate,
  isOverdue,
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
          <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
        </>
      }
      trailing={
        dueDate && (
          <span className={`task__due-date ${isOverdue ? 'is-overdue' : ''}`}>
            {dueDate}
          </span>
        )
      }

      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <AppIcon icon="moreHorizontal" />
        </Button>
      }
    >
      <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
        {title}
      </span>
    </Entry>
  );
}
