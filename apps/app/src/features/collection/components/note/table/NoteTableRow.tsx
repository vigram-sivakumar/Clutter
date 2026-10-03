import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import { CollectionTableRow } from '../../table/CollectionTableRow';
import {
  buildNoteTableGridTemplateColumns,
  DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  type NoteTableColumnVisibility,
} from './noteTableColumns';

export interface NoteTableRowProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /**
   * Whether the description line (including its "No description"
   * fallback) renders at all — defaults to `true`, the original
   * unconditional-fallback behavior. Set `false` to hide the whole line
   * (a genuinely absent `description` still falls back to placeholder
   * text when this is `true`; that's a different case from "hidden by
   * preference" and this prop is what distinguishes them).
   */
  showDescription?: boolean;
  emoji?: string;

  isSelected?: boolean;
  isSelectable?: boolean;
  onSelectedChange?: (selected: boolean) => void;

  lastOpened?: string;
  created?: string;
  updated?: string;
  archived?: string;
  /**
   * Which of the lastOpened/created/updated columns actually exist on
   * this row — not just whether their content is shown. An unchecked
   * column renders no cell at all and contributes no track to this row's
   * own `grid-template-columns`, computed via the same
   * `buildNoteTableGridTemplateColumns` NoteTable's header uses, so the
   * two can never drift out of alignment. Defaults to all three visible,
   * the original unconditional-column behavior.
   */
  columns?: NoteTableColumnVisibility;

  /**
   * Hover-gated trailing slot for the whole row (Archive's Restore/Delete)
   * — rendered as its own absolutely-positioned overlay in NoteTableRow.css
   * rather than through one of the CollectionEntry cells above, since none
   * of them is a dedicated trailing column the way Entry's `actions` was.
   */
  actions?: ReactNode;
}

export const NoteTableRow = forwardRef<HTMLDivElement, NoteTableRowProps>(
  function NoteTableRow(
    {
      title,
      description,
      showDescription = true,
      emoji,

      isSelected = false,
      isSelectable = false,
      onSelectedChange,

      lastOpened,
      created,
      updated,
      archived,
      columns = DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,

      actions,

      className,
      onClick,
      role,
      tabIndex,
      style,
      ...props
    },
    ref
  ) {
    const gridTemplateColumns = buildNoteTableGridTemplateColumns(columns);

    return (
      <CollectionTableRow
        {...props}
        ref={ref}
        className={className}
        gridTemplateColumns={gridTemplateColumns}
        actions={actions}
        onClick={onClick}
        role={role}
        tabIndex={tabIndex}
        style={style}
      >
        <CollectionEntry
          className="collection-table-row__entry"
          icon="note"
          emoji={emoji}
          title={title}
          description={
            showDescription ? description || 'No description' : undefined
          }
          descriptionClassName={
            showDescription && !description
              ? 'collection-table-row__description-empty'
              : undefined
          }
          isSelectable={isSelectable}
          isSelected={isSelected}
          onSelectedChange={onSelectedChange}
        />

        {columns.lastOpened && (
          <CollectionEntry
            className="collection-table-row__last-opened"
            metadata={lastOpened}
          />
        )}

        {columns.created && (
          <CollectionEntry
            className="collection-table-row__created"
            metadata={created}
          />
        )}

        {columns.updated && (
          <CollectionEntry
            className="collection-table-row__updated"
            metadata={updated}
          />
        )}

        {columns.archived && (
          <CollectionEntry
            className="collection-table-row__archived"
            metadata={archived}
          />
        )}

      </CollectionTableRow>
    );
  }
);

NoteTableRow.displayName = 'NoteTableRow';
