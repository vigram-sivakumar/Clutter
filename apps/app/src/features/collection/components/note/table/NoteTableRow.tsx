import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import './NoteTableRow.css';
import { CollectionEntry } from '@features/collection/CollectionEntry';
import {
  buildNoteTableGridTemplateColumns,
  DEFAULT_NOTE_TABLE_COLUMN_VISIBILITY,
  type NoteTableColumnVisibility,
} from './noteTableColumns';

export interface NoteTableRowProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /**
   * Whether the description line (including its "No description..."
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
    // Mirrors CollectionEntry's own handleClick guard — without this, a
    // click on the `actions` slot's Restore/Delete buttons (a sibling of
    // the CollectionEntry cells below, not nested inside one) would bubble
    // up and also fire the row's onClick (navigate/open).
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const interactiveElement = target.closest(
        'button, a, input, select, textarea, [role="button"]'
      );

      if (interactiveElement && interactiveElement !== event.currentTarget) {
        return;
      }

      onClick?.(event);
    };

    // The row itself (not the .note-table-row__entry cell) is this
    // component's click/keyboard target — same role="button"/tabIndex/
    // Enter-Space-dispatches-a-real-click pattern as CollectionEntry's own
    // handleKeyDown, so a Table-mode row is exactly as keyboard-activatable
    // as a List-mode one.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      event.currentTarget.click();
    };

    return (
      <div
        {...props}
        ref={ref}
        className={['note-table-row', className].filter(Boolean).join(' ')}
        onClick={onClick ? handleClick : undefined}
        onKeyDown={onClick ? handleKeyDown : undefined}
        role={role ?? (onClick ? 'button' : undefined)}
        tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
        style={{ gridTemplateColumns, ...style }}
      >
        <CollectionEntry
          className="note-table-row__entry"
          icon="note"
          emoji={emoji}
          title={title}
          description={
            showDescription ? description || 'No description...' : undefined
          }
          descriptionClassName={
            showDescription && !description
              ? 'note-table-row__description-empty'
              : undefined
          }
          isSelectable={isSelectable}
          isSelected={isSelected}
          onSelectedChange={onSelectedChange}
        />

        {columns.lastOpened && (
          <CollectionEntry
            className="note-table-row__last-opened"
            metadata={lastOpened}
          />
        )}

        {columns.created && (
          <CollectionEntry
            className="note-table-row__created"
            metadata={created}
          />
        )}

        {columns.updated && (
          <CollectionEntry
            className="note-table-row__updated"
            metadata={updated}
          />
        )}

        {actions && <div className="note-table-row__actions">{actions}</div>}
      </div>
    );
  }
);

NoteTableRow.displayName = 'NoteTableRow';
