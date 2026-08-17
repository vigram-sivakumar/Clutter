import { Button } from '@components/button/Button';
import { Entry, type EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useChangeIconTrigger } from '@components/change-icon-picker/useChangeIconTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
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

  /**
   * Present only when `menuItems` includes a `move-to` item — the same
   * Move destination picker (MoveDestinationPicker + useMoveDestinationTrigger)
   * ResourceTopBarActions uses, so a folder's Move flow is identical
   * regardless of whether it's triggered from the sidebar or the topbar.
   * Selecting 'move-to' from this row's own overflow menu opens the
   * picker anchored on this row's own trigger button, instead of
   * forwarding to onMenuSelect.
   */
  moveDestinations?: FolderPickerItem[];
  /** Invoked with the chosen destination (`null` = vault root). */
  onMove?: (destinationFolderId: string | null) => void;
  /** Present alongside moveDestinations — see MoveDestinationPicker's matching prop. */
  onCreateFolder?: (name: string) => Promise<string>;

  /**
   * Present when `menuItems` includes a `change-icon` item — selecting it
   * from this row's overflow menu opens ChangeIconPicker anchored on this
   * row's own trigger button, instead of forwarding to onMenuSelect.
   */
  onChangeIcon?: (emoji: string | null) => void;
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
  moveDestinations,
  onMove,
  onCreateFolder,
  onChangeIcon,
  // Pulled out (not left in ...entryProps) so it can be combined with
  // this row's own hover-forcing reasons below, rather than one silently
  // overwriting the other via the {...entryProps} spread order — a
  // caller-supplied forceHover (e.g. FolderPicker's keyboard-highlight)
  // must survive alongside "menu/move-picker is open."
  forceHover: externalForceHover = false,
  ...entryProps
}: FolderProps) {
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);
  const changeIconTrigger = useChangeIconTrigger(onChangeIcon !== undefined);

  return (
    <>
      <Entry
        {...entryProps}
        // Forces every hover-driven affordance (background, revealed
        // actions) to stay visible while this row's menu is open — the
        // trigger button that controls the menu lives in .entry__actions,
        // which is itself hover-gated, so without this, moving the mouse
        // away mid-menu would hide the button needed to close it. Also
        // forced while the Move picker is open, or when a caller
        // (FolderPicker's keyboard navigation) asks for it explicitly.
        forceHover={externalForceHover || menuOpen || moveTrigger.open || changeIconTrigger.open}
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
                triggerRef={moveTrigger.triggerRef}
                open={menuOpen}
                onOpenChange={onMenuOpenChange ?? (() => {})}
                onSelect={(id) =>
                  changeIconTrigger.handleSelect(id, (id) =>
                    moveTrigger.handleSelect(id, onMenuSelect ?? (() => {}))
                  )
                }
                side="bottom"
                alignment="start"
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
      {moveDestinations !== undefined && (
        <MoveDestinationPicker
          anchorRef={moveTrigger.triggerRef}
          open={moveTrigger.open}
          onClose={moveTrigger.close}
          items={moveDestinations}
          onSelect={(destinationFolderId) => {
            moveTrigger.close();
            onMove?.(destinationFolderId);
          }}
          onCreateFolder={onCreateFolder}
          side="bottom"
          alignment="start"
        />
      )}
      {onChangeIcon !== undefined && (
        <ChangeIconPicker
          anchorRef={moveTrigger.triggerRef}
          open={changeIconTrigger.open}
          onClose={changeIconTrigger.close}
          hasIcon={emoji != null && emoji !== ''}
          onSelect={onChangeIcon}
          onRemove={() => onChangeIcon(null)}
          side="bottom"
          alignment="start"
        />
      )}
    </>
  );
}
