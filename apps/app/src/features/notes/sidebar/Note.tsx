import { Entry, type EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getPageIcon';

import './Note.css';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  titleStyle?: 'default' | 'placeholder';
  emoji?: string | null;

  /** Renders the title as an EditableText field instead of static text. */
  isEditing?: boolean;
  /** See PageTitle.onCommit — discrete-commit entry point (a draft's title). */
  onTitleCommit?(value: string): void;
  /** See PageTitle.onEdit — continuous-commit entry point (a persisted Note's title channel). */
  onTitleEdit?(value: string): void;
  /** See PageTitle.onFlush. */
  onTitleFlush?(): void;
  /** See PageTitle.onCancel. */
  onTitleCancel?(): void;
  /** Fired when the rename session ends (committed or not) — the row's own signal to leave edit mode. */
  onTitleEditingEnd?(): void;

  /** Overflow menu items — omitted renders the existing unwired button (e.g. FavoriteList). */
  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;
}

export function Note({
  title,
  titleStyle = 'default',
  emoji,
  isEditing = false,
  onTitleCommit,
  onTitleEdit,
  onTitleFlush,
  onTitleCancel,
  onTitleEditingEnd,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  active = false,
  ...entryProps
}: NoteProps) {
  return (
    <Entry
      {...entryProps}
      // Reuses Entry's existing hover appearance (.entry-active shares the
      // same CSS rule as :hover) rather than inventing a new "menu open"
      // visual state — the row stays visibly the owner of its open menu.
      active={active || menuOpen}
      leading={
        <AppIcon
          className="note__icon"
          icon={getPageIcon('note')}
          emoji={emoji}
        />
      }
      actions={
        <OverflowMenu
          items={menuItems ?? []}
          open={menuOpen}
          onOpenChange={onMenuOpenChange ?? (() => {})}
          onSelect={onMenuSelect ?? (() => {})}
          size="small"
        />
      }
    >
      {isEditing ? (
        <EditableText
          value={title ?? ''}
          autoFocus
          onCommit={onTitleCommit ?? (() => {})}
          onEdit={onTitleEdit}
          onFlush={onTitleFlush}
          onCancel={onTitleCancel}
          onEditingEnd={onTitleEditingEnd}
        />
      ) : (
        <span
          className={
            titleStyle === 'placeholder'
              ? 'note__title note__title--placeholder'
              : 'note__title'
          }
        >
          {title}
        </span>
      )}
    </Entry>
  );
}
