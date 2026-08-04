import { Button } from '@components/button/Button';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getPageIcon';

import './Note.css';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  titleStyle?: 'default' | 'placeholder';
  emoji?: string | null;
}

export function Note({
  title,
  titleStyle = 'default',
  emoji,
  ...entryProps
}: NoteProps) {
  return (
    <Entry
      {...entryProps}
      leading={
        <AppIcon
          className="note__icon"
          icon={getPageIcon('note')}
          emoji={emoji}
        />
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
      <span
        className={
          titleStyle === 'placeholder'
            ? 'note__title note__title--placeholder'
            : 'note__title'
        }
      >
        {title}
      </span>
    </Entry>
  );
}
