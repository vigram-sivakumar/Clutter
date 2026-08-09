import { Button } from '@components/button/Button';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import { FolderLeading } from './FolderLeading';
import './Folder.css';

export interface FolderProps extends Omit<EntryProps, 'children'> {
  title?: string;
  titleStyle?: 'default' | 'placeholder';
  /** Shown by EditableText during rename when the title buffer is empty. */
  titlePlaceholder?: string;
  emoji?: string | null;

  isEmpty?: boolean;
  hasCaret?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
  /**
   * The per-row "+" action — opens a new draft note scoped to this folder.
   * Optional so Folder stays usable in contexts (e.g. read-only pickers)
   * that don't want the affordance.
   */
  onAddClick?: () => void;

  /** Renders the title as an EditableText field instead of static text. */
  isEditing?: boolean;
  /** See PageTitle.onEdit — folder rename is channel-backed, same as a persisted Note's title. */
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

export function Folder({
  title,
  titleStyle = 'default',
  titlePlaceholder,
  emoji,
  isEmpty = false,
  hasCaret = true,
  isExpanded = false,
  onExpandToggle,
  onAddClick,
  isEditing = false,
  onTitleEdit,
  onTitleFlush,
  onTitleCancel,
  onTitleEditingEnd,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  ...entryProps
}: FolderProps) {
  return (
    <Entry
      {...entryProps}
      // Forces every hover-driven affordance (background, revealed
      // actions) to stay visible while this row's menu is open — the
      // trigger button that controls the menu lives in .entry__actions,
      // which is itself hover-gated, so without this, moving the mouse
      // away mid-menu would hide the button needed to close it.
      forceHover={menuOpen}
      leading={
        <FolderLeading
          emoji={emoji}
          isEmpty={isEmpty}
          hasCaret={hasCaret}
          isExpanded={isExpanded}
          onExpandToggle={onExpandToggle}
        />
      }
      actions={
        <>
          {onAddClick && (
            <Button
              size="small"
              variant="ghost"
              interaction="subtle"
              isIconOnly
              onClick={onAddClick}
            >
              <AppIcon icon={'plus'} />
            </Button>
          )}
          {menuItems && menuItems.length > 0 && (
            <OverflowMenu
              items={menuItems ?? []}
              open={menuOpen}
              onOpenChange={onMenuOpenChange ?? (() => {})}
              onSelect={onMenuSelect ?? (() => {})}
              side="bottom"
              alignment="start"
              size="small"
            />
          )}
        </>
      }
    >
      {isEditing ? (
        <EditableText
          value={title ?? ''}
          placeholder={titlePlaceholder}
          autoFocus
          onCommit={() => {}}
          onEdit={onTitleEdit}
          onFlush={onTitleFlush}
          onCancel={onTitleCancel}
          onEditingEnd={onTitleEditingEnd}
        />
      ) : (
        <span
          className={
            titleStyle === 'placeholder'
              ? 'folder__title folder__title--placeholder'
              : 'folder__title'
          }
        >
          {title}
        </span>
      )}
    </Entry>
  );
}
