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
  /**
   * The per-row "+" action — opens a new draft note scoped to this folder.
   * Optional so Folder stays usable in contexts (e.g. read-only pickers)
   * that don't want the affordance.
   */
  onAddClick?: () => void;
}

export function Folder({
  title,
  emoji,
  isEmpty = false,
  hasCaret = true,
  isExpanded = false,
  onExpandToggle,
  onAddClick,
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
          <Button
            size="small"
            variant="ghost"
            interaction="subtle"
            isIconOnly
            onClick={onAddClick}
          >
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
