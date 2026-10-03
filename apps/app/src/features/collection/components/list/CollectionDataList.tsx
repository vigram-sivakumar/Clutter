import type { HTMLAttributes, ReactNode } from 'react';

import type { SystemIcon } from '@shared/icon';

import type { CollectionRowAttributes } from '../collectionRowAttributes';
import { CollectionListGrid } from './CollectionListGrid';
import { CollectionListRow } from './CollectionListRow';

/**
 * One item of a collection list, described by data only: the same handful of
 * values for every collection, so every List view looks and behaves the same.
 */
export interface CollectionDataListItem {
  readonly id: string;
  readonly icon?: SystemIcon;
  readonly emoji?: string;
  readonly title: string;
  /** Replaces the plain-text title — an inline rename editor, most commonly. */
  readonly titleContent?: ReactNode;
  readonly description?: string;
  /** The muted trailing line(s) — dates, a kind label. One entry per value; none renders no metadata at all. */
  readonly metadata?: readonly string[];
  readonly isSelected?: boolean;
  /** Hover-revealed trailing slot (Archive's Restore / Delete). */
  readonly actions?: ReactNode;
  /** Opens the item (click / Enter / Space). */
  readonly onClick?: () => void;
  readonly props?: CollectionRowAttributes;
}

export interface CollectionDataListProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly CollectionDataListItem[];
  /** A trailing "New …" row (`label` is its whole title); absent, none renders. */
  readonly newItem?: { readonly label: string; readonly onClick: () => void };
}

/**
 * The one list every collection renders in List mode — notes, assets, the
 * Archive. A collection supplies only data (a `CollectionDataListItem` per
 * item); this draws the shared list grid and one shared row per item, with no
 * styling of its own. It knows nothing about notes, assets or any other item
 * type.
 */
export function CollectionDataList({ items, newItem, ...props }: CollectionDataListProps) {
  return (
    <CollectionListGrid {...props}>
      {items.map((item) => (
        <CollectionListRow
          {...item.props}
          key={item.id}
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
          isSelected={item.isSelected}
          actions={item.actions}
          onClick={item.onClick}
        />
      ))}

      {newItem && (
        <CollectionListRow
          className="collection-list-grid__new-item"
          icon="plus"
          title={newItem.label}
          onClick={newItem.onClick}
        />
      )}
    </CollectionListGrid>
  );
}
