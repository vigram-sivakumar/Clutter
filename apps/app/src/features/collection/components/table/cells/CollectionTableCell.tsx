import type { ReactNode } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { CollectionMedia, type CollectionMediaProps } from '../../media/CollectionMedia';
import { CollectionEntry } from '../../entry/CollectionEntry';
import { CollectionEntryProperties } from '../../entry/CollectionEntryProperties';
import './CollectionTableCell.css';

/** The row's primary ("name") cell: icon or emoji, title, description. */
export interface CollectionTableHeaderCellValue {
  readonly variant: 'header';
  readonly icon?: SystemIcon;
  /** Drawn instead of `icon` when set. */
  readonly emoji?: string;
  /** Replaces the icon/emoji box — a thumbnail (`CollectionMedia`) in front of the name, for one. */
  readonly leading?: ReactNode;
  readonly title?: string;
  /** Replaces the plain-text title — an inline rename editor, most commonly. */
  readonly titleContent?: ReactNode;
  readonly description?: string;
  /** Drawn right after the title, as its sibling (see `CollectionEntry`'s `actions`). */
  readonly actions?: ReactNode;
  /** Shown, muted, when `description` is empty. Absent, an empty description draws nothing. */
  readonly descriptionPlaceholder?: string;
  readonly className?: string;
}

/** A muted one-line value: a type, a path, a date. */
export interface CollectionTableTextCellValue {
  readonly variant: 'text';
  /** The text as it should read. Absent, the cell stays empty but still occupies its grid track, so columns never shift. */
  readonly value?: string;
  /**
   * The machine-readable instant (ISO 8601) the text stands for, when it is a date or time —
   * exposed as `data-date`; never drawn. A property of the text, not a kind of cell.
   */
  readonly dateTime?: string;
  readonly className?: string;
}

/** A thumbnail in the shared media frame. */
export interface CollectionTableMediaCellValue extends CollectionMediaProps {
  readonly variant: 'media';
  readonly className?: string;
}

/** Anything else a column needs to show — a control, a link — drawn as one value, like the text and media variants. */
export interface CollectionTableCustomCellValue {
  readonly variant: 'custom';
  readonly children: ReactNode;
  readonly className?: string;
}

export type CollectionTableCellProps =
  | CollectionTableHeaderCellValue
  | CollectionTableTextCellValue
  | CollectionTableMediaCellValue
  | CollectionTableCustomCellValue;

const join = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ');

/**
 * One cell of a collection table, in one of four variants: `header` (the
 * row's name cell), `text` (a muted value, optionally with the instant it
 * stands for) or `media` (a thumbnail). Generic — a collection describes its
 * values in these terms and never brings a cell component of its own.
 */
export function CollectionTableCell(props: CollectionTableCellProps) {
  switch (props.variant) {
    case 'header':
      return (
        <CollectionEntry
          layout="cell"
          className={join('collection-table-cell', 'collection-table-cell--header', props.className)}
          leading={props.leading ?? (props.icon || props.emoji ? <AppIcon icon={props.icon} emoji={props.emoji} /> : undefined)}
          title={props.title ?? ''}
          titleContent={props.titleContent}
          description={props.description || props.descriptionPlaceholder}
          actions={props.actions}
        />
      );

    case 'text':
      return (
        <div
          className={join('collection-table-cell', 'collection-table-cell--text', props.className)}
          data-date={props.dateTime}
        >
          {props.value && <CollectionEntryProperties>{props.value}</CollectionEntryProperties>}
        </div>
      );

    case 'media':
      return (
        <div className={join('collection-table-cell', 'collection-table-cell--media', props.className)}>
          <CollectionEntryProperties>
            <CollectionMedia onClick={props.onClick} label={props.label}>
              {props.children}
            </CollectionMedia>
          </CollectionEntryProperties>
        </div>
      );

    case 'custom':
      return (
        <div className={join('collection-table-cell', 'collection-table-cell--custom', props.className)}>
          <CollectionEntryProperties>{props.children}</CollectionEntryProperties>
        </div>
      );
  }
}
