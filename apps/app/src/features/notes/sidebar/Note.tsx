import { Button } from '@components/button/Button';
import { Caret } from '@components/caret/Caret';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  emoji?: string | null;
  hasCaret?: boolean;
}

export function Note({
  title,
  emoji,
  hasCaret = true,
  ...entryProps
}: NoteProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <>
          {hasCaret && <Caret isPlaceholder />}
          <AppIcon icon={'note'} emoji={emoji} />
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
