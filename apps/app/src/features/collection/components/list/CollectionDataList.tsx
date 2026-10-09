import type { HTMLAttributes, ReactNode } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { CollectionMedia, type CollectionMediaProps } from '../media/CollectionMedia';
import { CollectionEntry } from '../entry/CollectionEntry';
import { CollectionEntryProperties } from '../entry/CollectionEntryProperties';
import type { CollectionEntryAttributes } from '../entry/collectionEntryAttributes';
import './CollectionDataList.css';

/** One item of a collection list, described by data only. */
export interface CollectionDataListItem {
  readonly id: string;

  readonly icon?: SystemIcon;
  readonly emoji?: string;
  /** Replaces the icon/emoji — a thumbnail (`CollectionMedia`), a checkbox — in front of the title, for one. */
  readonly leading?: ReactNode;

  readonly title: string;
  /** Replaces the plain-text title — an inline rename editor, most commonly. */
  readonly titleContent?: ReactNode;

  readonly description?: string;

  /** Drawn right after the title and description, as the body's sibling (see `CollectionEntry`'s `actions`). */
  readonly actions?: ReactNode;

  /** The muted trailing values (dates, a kind label), one per entry; none draws no metadata. */
  readonly metadata?: readonly string[];

  /** A custom node after the metadata values in the entry's trailing slot (a link to somewhere, say), in its own `CollectionEntryProperties`. */
  readonly trailing?: ReactNode;

  /** A thumbnail at the entry's trailing end, in the shared media frame. */
  readonly media?: CollectionMediaProps;

  readonly isSelected?: boolean;

  /** Opens the item (click / Enter / Space). */
  readonly onClick?: () => void;

  /** Extra `data-*` / ARIA attributes for the row. */
  readonly props?: CollectionEntryAttributes;
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
 * A list from data: one `CollectionEntry` per item in a flush column. The
 * caller supplies values only; this draws them. It knows nothing about what
 * an item is.
 *
 * `description` is the line under the title; everything else the item carries (its `metadata` values,
 * a custom `trailing` node, the `media` thumbnail) is drawn in the entry's `trailing` slot, each in its own
 * `CollectionEntryProperties`.
 */
export function CollectionDataList({ items, newItem, className, ...props }: CollectionDataListProps) {
  return (
    <div {...props} className={['collection-list', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <CollectionEntry
          {...item.props}
          key={item.id}
          layout="list"
          leading={item.leading ?? (item.icon || item.emoji ? <AppIcon icon={item.icon} emoji={item.emoji} /> : undefined)}
          title={item.title}
          titleContent={item.titleContent}
          description={item.description}
          actions={item.actions}
          trailing={trailingOf(item)}
          isSelected={item.isSelected}
          onClick={item.onClick ? () => item.onClick?.() : undefined}
        />
      ))}
      {newItem && (
        <CollectionEntry
          className="collection-entry--new"
          layout="list"
          leading={<AppIcon icon="plus" />}
          title={newItem.label}
          onClick={newItem.onClick}
        />
      )}
    </div>
  );
}

/** An item's trailing run — its metadata values, then any custom node, then the thumbnail — or nothing at all. */
function trailingOf(item: CollectionDataListItem): ReactNode {
  const hasMetadata = item.metadata !== undefined && item.metadata.length > 0;

  if (!hasMetadata && !item.trailing && !item.media) {
    return undefined;
  }

  return (
    <>
      {item.metadata?.map((value, index) => (
        <CollectionEntryProperties key={`${index}:${value}`}>{value}</CollectionEntryProperties>
      ))}
      {item.trailing && <CollectionEntryProperties>{item.trailing}</CollectionEntryProperties>}
      {item.media && (
        <CollectionEntryProperties>
          <CollectionMedia onClick={item.media.onClick} label={item.media.label}>
            {item.media.children}
          </CollectionMedia>
        </CollectionEntryProperties>
      )}
    </>
  );
}
