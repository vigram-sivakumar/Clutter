import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './FolderCard.css';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import type { SystemIcon } from '@shared/icon';

export interface FolderCardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional so the permanent "Create folder" grid card (CollectionBody's
   * renderCreateFolderCard) can render icon-only, with no title/metadata —
   * every real-folder caller still always passes one, so their rendering
   * is unaffected (metadata below is gated on this exact presence check).
   */
  title?: string;
  /** Overrides the default 'folder' glyph — only the create-folder card uses this (icon="plus"). */
  icon?: SystemIcon;

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
      icon = 'folder',
      emoji,
      subfolderCount,
      noteCount,
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
    // Counts present = a real folder (stacked card with a metadata row); absent = the create card (icon + title only).
    const hasCounts = subfolderCount !== undefined || noteCount !== undefined;

    return (
      <CollectionEntry
        {...props}
        ref={ref}
        className={['folder-card', className].filter(Boolean).join(' ')}
        stacked={Boolean(title) && hasCounts}
        icon={icon}
        emoji={emoji}
        title={title}
        metadata={
          title && hasCounts ? (
            <>
              <span>{subfolderCount ?? 0} Subfolders</span>
              <span>{noteCount ?? 0} Notes</span>
            </>
          ) : undefined
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
