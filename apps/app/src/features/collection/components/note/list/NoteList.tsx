import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import './NoteList.css';

export interface NoteListProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  emoji?: string;

  isSelected?: boolean;
  isSelectable?: boolean;
  onSelectedChange?: (selected: boolean) => void;

  lastOpened?: string;
  created?: string;
  updated?: string;

  /** Hover-gated trailing slot — see CollectionEntry's own `actions` doc comment. */
  actions?: ReactNode;
}

export const NoteList = forwardRef<HTMLDivElement, NoteListProps>(
  function NoteList(
    {
      title,
      description,
      emoji,

      isSelected = false,
      isSelectable = false,
      onSelectedChange,

      lastOpened,
      created,
      updated,

      actions,

      className,
      ...props
    },
    ref
  ) {
    // Only a truly present value gets a <span> — an unchecked/absent
    // property must leave no trace in the DOM, not an empty element a
    // stylesheet happens to hide. `hasMetadata` is what lets the whole
    // metadata prop become `undefined` (rather than an empty-but-present
    // Fragment) when nothing is left to show, so CollectionEntry's own
    // `metadata && <div>` skips the wrapper too.
    const hasMetadata = Boolean(lastOpened || created || updated);

    return (
      <CollectionEntry
        {...props}
        ref={ref}
        className={['note-list', className].filter(Boolean).join(' ')}

        icon="note"
        emoji={emoji}
        title={title}
        description={description}
        metadata={
          hasMetadata ? (
            <>
              {lastOpened && <span>{lastOpened}</span>}
              {created && <span>{created}</span>}
              {updated && <span>{updated}</span>}
            </>
          ) : undefined
        }
        isSelectable={isSelectable}
        isSelected={isSelected}
        onSelectedChange={onSelectedChange}
        actions={actions}
      />
    );
  }
);

NoteList.displayName = 'NoteList';
