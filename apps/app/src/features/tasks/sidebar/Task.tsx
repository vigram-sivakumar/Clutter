import { Entry, EntryProps } from '@components/entry/Entry';
import { Checkbox } from '@components/checkbox/Checkbox';
// import { Caret } from '@components/caret/Caret';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

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
          {/* <Caret
            isPlaceholder={isEmpty}
            isExpanded={isExpanded}
            variant="tree"
          /> */}
          <Checkbox isChecked={isChecked} onCheckedChange={onCheckedChange} />
        </>
      }
      actions={
        <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
          <AppIcon icon="moreHorizontal" />
        </Button>
      }
    >
      <span className={isChecked ? 'is-completed' : undefined}>{title}</span>
    </Entry>
  );
}
