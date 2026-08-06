import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import './Task.css';

interface TaskProps extends Omit<EntryProps, 'children'> {
  title?: string;
  dueDate?: string;
  isOverdue?: boolean;

  isChecked: boolean;

  onCheckedChange?: (checked: boolean) => void;
}

export function Task({
  title,
  dueDate,
  isOverdue,
  isChecked,
  onCheckedChange,
  ...entryProps
}: TaskProps) {
  return (
    <Entry
      {...entryProps}
      leading={<Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />}
      trailing={
        dueDate && (
          <span className={`task__due-date ${isOverdue ? 'is-overdue' : ''}`}>
            {dueDate}
          </span>
        )
      }

      actions={
        <OverflowMenu
          items={[]}
          open={false}
          onOpenChange={() => {}}
          onSelect={() => {}}
          size="small"
        />
      }
    >
      <span className={`task-title ${isChecked ? 'is-completed' : ''}`}>
        {title}
      </span>
    </Entry>
  );
}
