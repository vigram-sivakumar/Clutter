import type { HTMLAttributes, ReactNode } from 'react';
import type { SystemIcon } from '@shared/icon';
import { CollectionMedia, type CollectionMediaProps } from '../media/CollectionMedia';
import { CollectionRow } from '../row/CollectionRow';
import type { CollectionRowAttributes } from '../row/collectionRowAttributes';
import './CollectionDataList.css';

/** One item of a collection list, described by data only. */
export interface CollectionDataListItem {
  readonly id: string;

  readonly icon?: SystemIcon;
  readonly emoji?: string;

  readonly title: string;
  /** Replaces the plain-text title — an inline rename editor, most commonly. */
  readonly titleContent?: ReactNode;

  readonly description?: string;

  /** The muted trailing values (dates, a kind label), one per entry; none draws no metadata. */
  readonly metadata?: readonly string[];

  /** A thumbnail at the row's trailing end, in the shared media frame. */
  readonly media?: CollectionMediaProps;

  readonly isSelected?: boolean;

  /** Revealed on hover/focus at the row's end. */
  readonly actions?: ReactNode;

  /** Opens the item (click / Enter / Space). */
  readonly onClick?: () => void;

  /** Extra `data-*` / ARIA attributes for the row. */
  readonly props?: CollectionRowAttributes;
}

export interface CollectionDataListProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly CollectionDataListItem[];

  /** A trailing "New …" row (`label` is its whole title); absent, none is drawn. */
  readonly newItem?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

/**
 * A list from data: one `CollectionRow` per item in a flush column. The
 * caller supplies values only; this draws them. It knows nothing about what
 * an item is.
 */
export function CollectionDataList({ items, newItem, className, ...props }: CollectionDataListProps) {
  return (
    <div {...props} className={['cx-collection-list', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <CollectionRow
          {...item.props}
          key={item.id}
          layout="list"
          icon={item.icon}
          emoji={item.emoji}
          title={item.title}
          titleContent={item.titleContent}
          description={item.description}
          metadata={
            item.metadata && item.metadata.length > 0 ? (
              <>
                {item.metadata.map((value, index) => (
                  <span key={`${index}:${value}`}>{value}</span>
                ))}
              </>
            ) : undefined
          }
          media={
            item.media ? (
              <CollectionMedia onClick={item.media.onClick} label={item.media.label}>
                {item.media.children}
              </CollectionMedia>
            ) : undefined
          }
          isSelected={item.isSelected}
          actions={item.actions}
          onClick={item.onClick ? () => item.onClick?.() : undefined}
        />
      ))}
      {newItem && (
        <CollectionRow
          layout="list"
          tone="action"
          icon="plus"
          title={newItem.label}
          onClick={newItem.onClick}
        />
      )}
    </div>
  );
}
