import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './FolderCard.css';
import { CollectionEntry } from '@features/collection/CollectionEntry';

export interface FolderCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;

  emoji?: string;
  subfolderCount?: number;
  noteCount?: number;

  isSelected?: boolean;
  isSelectable?: boolean;
  onSelectedChange?: (selected: boolean) => void;

  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;

  /** Hover-gated trailing slot — see CollectionEntry's own `actions` doc comment. */
  actions?: ReactNode;
}

export const FolderCard = forwardRef<HTMLDivElement, FolderCardProps>(
  function FolderCard(
    {
      title,
      emoji,
      subfolderCount = 0,
      noteCount = 0,
      isSelected = false,
      isSelectable = false,
      onSelectedChange,
      className,
      onClick,
      actions,
      ...props
    },
    ref
  ) {
    return (
      <CollectionEntry
        {...props}
        ref={ref}
        className={['folder-card', className].filter(Boolean).join(' ')}
        icon="folder"
        emoji={emoji}
        title={title}
        metadata={
          <>
            <span>{subfolderCount} Subfolders</span>
            <span>{noteCount} Notes</span>
          </>
        }
        isSelected={isSelected}
        isSelectable={isSelectable}
        onSelectedChange={onSelectedChange}
        onClick={onClick}
        actions={actions}
      />
    );
  }
);

FolderCard.displayName = 'FolderCard';
