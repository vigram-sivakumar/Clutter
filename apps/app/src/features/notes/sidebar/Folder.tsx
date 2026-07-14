import { IconSlot } from '@components/icon-slot/IconSlot';
import { Button } from '@components/button/Button';
import { Caret } from '@components/caret/Caret';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';

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
          <IconSlot icon="folder" />
        </>
      }
      actions={
        <>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <AppIcon icon={'plus'} />
          </Button>
          <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
            <AppIcon icon={'moreHorizontal'} />
          </Button>
        </>
      }
    >
      {title}
    </Entry>
  );
}
