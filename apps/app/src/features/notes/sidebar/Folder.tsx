import { Button } from '@components/button/Button';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { AppIcon } from '@shared/icon';
import { FolderLeading } from './FolderLeading';
import './Folder.css';

interface FolderProps extends Omit<EntryProps, 'children'> {
  title?: string;
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
          <Button
            size="small"
            variant="ghost"
            interaction="subtle"
            isIconOnly
            onClick={onAddClick}
          >
            <AppIcon icon={'plus'} />
          </Button>
          {menuItems ? (
            <OverflowMenu
              items={menuItems}
              open={menuOpen}
              onOpenChange={onMenuOpenChange ?? (() => {})}
              onSelect={onMenuSelect ?? (() => {})}
              size="small"
            />
          ) : (
            <Button size="small" variant="ghost" interaction="subtle" isIconOnly>
              <AppIcon icon={'moreHorizontal'} />
            </Button>
          )}
        </>
      }
    >
      {isEditing ? (
        <EditableText
          value={title ?? ''}
          autoFocus
          onCommit={() => {}}
          onEdit={onTitleEdit}
          onFlush={onTitleFlush}
          onCancel={onTitleCancel}
          onEditingEnd={onTitleEditingEnd}
        />
      ) : (
        title
      )}
    </Entry>
  );
}
