import { Button } from '@components/button/Button';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import { FolderLeading } from './FolderLeading';
import './Folder.css';

interface FolderProps extends Omit<EntryProps, 'children'> {
  title?: string;
  emoji?: string | null;

  isEmpty?: boolean;
  hasCaret?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

export function Folder({
  title,
  emoji,
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
        <FolderLeading
          emoji={emoji}
          isEmpty={isEmpty}
          hasCaret={hasCaret}
          isExpanded={isExpanded}
          onExpandToggle={onExpandToggle}
        />
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
