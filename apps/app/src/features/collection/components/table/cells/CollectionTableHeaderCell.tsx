import type { ReactNode } from 'react';

import { CollectionEntry } from '@features/collection/CollectionEntry';
import type { SystemIcon } from '@shared/icon';

import './CollectionTableCells.css';

export interface CollectionTableHeaderCellProps {
  /** The leading icon — ignored when `emoji` is set. */
  readonly icon?: SystemIcon;
  readonly emoji?: string;

  readonly title?: string;
  /** Replaces the plain-text title — an inline rename editor, most commonly. */
  readonly titleContent?: ReactNode;

  readonly description?: string;
  /**
   * Shown in placeholder styling when `description` is empty (e.g. "No
   * description"). Absent, an empty description renders no line at all.
   */
  readonly descriptionPlaceholder?: string;

  /** Secondary line(s) under the title — a kind label, a path, tags. */
  readonly metadata?: ReactNode;

  readonly isSelectable?: boolean;
  readonly isSelected?: boolean;
  readonly onSelectedChange?: (selected: boolean) => void;

  readonly className?: string;
}

/**
 * A table row's primary ("Name") cell: icon or emoji, title, description and
 * metadata, plus the hover/selection checkbox. Generic — notes, assets or any
 * future collection fill it with their own values; it knows nothing about
 * what an item is. Built on `CollectionEntry` so it shares List/Card's DOM and
 * styling, and keeps the `collection-table-row__entry` class the row's
 * hover-to-reveal-checkbox rules target.
 */
export function CollectionTableHeaderCell({
  icon,
  emoji,
  title,
  titleContent,
  description,
  descriptionPlaceholder,
  metadata,
  isSelectable = false,
  isSelected = false,
  onSelectedChange,
  className,
}: CollectionTableHeaderCellProps) {
  const showsPlaceholder = !description && descriptionPlaceholder !== undefined;

  return (
    <CollectionEntry
      className={[
        'collection-table-row__entry',
        'collection-table-cell',
        'collection-table-cell--header',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      icon={icon}
      emoji={emoji}
      title={title}
      titleContent={titleContent}
      description={showsPlaceholder ? descriptionPlaceholder : description}
      descriptionClassName={
        showsPlaceholder ? 'collection-table-row__description-empty' : undefined
      }
      metadata={metadata}
      isSelectable={isSelectable}
      isSelected={isSelected}
      onSelectedChange={onSelectedChange}
    />
  );
}
