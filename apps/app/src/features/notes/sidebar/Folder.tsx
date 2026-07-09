import { Icons } from '@design-system/icons';
import { IconSlot } from '@design-system/icons/IconSlot';
import { Button } from '@components/button/Button';
import { Caret } from '@components/caret/Caret';
import { Entry, type EntryProps } from '@app/layouts/sidebar/entry/Entry';

interface FolderProps extends Omit<EntryProps, 'children'> {
  title?: string;

  isEmpty?: boolean;
  hasCaret?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

export function Folder({
  title,
  isEmpty = false,
  hasCaret = true,
  isExpanded = false,
  onExpandToggle,
  ...entryProps
}: FolderProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <>
          {hasCaret && (
            <Caret
              disabled={isEmpty}
              isExpanded={isExpanded}
              variant="tree"
              onClick={onExpandToggle}
            />
          )}
          <IconSlot>
            <Icons.Folder />
          </IconSlot>
        </>
      }
      actions={
        <>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <Icons.Plus />
          </Button>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <Icons.MoreHorizontal />
          </Button>
        </>
      }
    >
      {title}
    </Entry>
  );
}
