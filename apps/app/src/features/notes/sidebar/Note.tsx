import { Button } from '@components/button/Button';
import { Caret } from '@components/caret/Caret';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getDefaultPageIcon';

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
          <AppIcon icon={getPageIcon('note')} emoji={emoji} />
        </>
      }
      actions={
        <Button
          isIconOnly
          size="small"
          variant="ghost"
          interaction="subtle"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <AppIcon icon={'moreHorizontal'} />
        </Button>
      }
    >
      {title}
    </Entry>
  );
}
