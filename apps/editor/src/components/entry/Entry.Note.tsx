import { Icons } from '../../design-system/icons';
import { IconSlot } from '../../design-system/icons/IconSlot';
import { Button } from '../Button';
import { Caret } from '../Caret';
import { Entry, type EntryProps } from './Entry';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
}

export function Note({ title, ...entryProps }: NoteProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <>
          <Caret isPlaceholder />
          <IconSlot>
            <Icons.Note />
          </IconSlot>
        </>
      }
      actions={
        <Button isIconOnly size="small" variant="ghost" interaction="subtle">
          <Icons.MoreHorizontal />
        </Button>
      }
    >
      {title}
    </Entry>
  );
}
