import { IconSlot } from '@components/icon-slot/IconSlot';
import { Button } from '@components/button/Button';
import { Caret } from '@components/caret/Caret';
import { Entry, type EntryProps } from '@app/layouts/sidebar/entry/Entry';
import { AppIcon } from '@shared/icon';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  hasCaret?: boolean;
}

export function Note({ title, hasCaret = true, ...entryProps }: NoteProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <>
          {hasCaret && <Caret isPlaceholder />}
          <IconSlot icon="note" />
        </>
      }
      actions={
        <Button isIconOnly size="small" variant="ghost" interaction="subtle">
          <AppIcon icon={'moreHorizontal'} />
        </Button>
      }
    >
      {title}
    </Entry>
  );
}
