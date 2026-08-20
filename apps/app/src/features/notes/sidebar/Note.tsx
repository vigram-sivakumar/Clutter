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
import { getPageIcon } from '@core/presentation/getPageIcon';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';

import './Note.css';

interface NoteProps extends Omit<EntryProps, 'children'> {
  title?: string;
  titleStyle?: 'default' | 'placeholder';
  /** Shown by EditableText during rename when the title buffer is empty. */
  titlePlaceholder?: string;
  emoji?: string | null;

  /**
   * Injected exactly like the page editor's own WikiLink/Tag resolution
   * (see MarkdownEditor's props of the same name) — omitted falls back to
   * renderCompactMarkdown's own unresolved/raw-text fallback, never a
   * second resolution implementation.
   */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;

  /** Renders the title as an EditableText field instead of static text. */
  isEditing?: boolean;
  /**
   * See PageTitle.onCommit — discrete-commit entry point. A draft's title
   * commit persists directly; a persisted note's is a synchronous
   * canRename() pre-check only (the continuous channel below still does
   * the actual persisting). Either way, returning `false` rejects the
   * submitted value (EditableText stays open, shakes, preserves the typed
   * value).
   */
  onTitleCommit?(value: string): void | boolean;
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

  /**
   * Present only when `menuItems` includes a `move-to` item — the same
   * Move destination picker (MoveDestinationPicker + useMoveDestinationTrigger)
   * ResourceTopBarActions and Folder.tsx use, so a note's Move flow is
   * identical regardless of entry point. Selecting 'move-to' from this
   * row's own overflow menu opens the picker anchored on this row's own
   * trigger button, instead of forwarding to onMenuSelect.
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

export function Note({
  title,
  titleStyle = 'default',
  titlePlaceholder,
  emoji,
  resolveWikiLink,
  resolveTag,
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
  moveDestinations,
  onMove,
  onCreateFolder,
  onChangeIcon,
  // Pulled out (not left in ...entryProps) so it can be combined with
  // this row's own hover-forcing reasons below, rather than one silently
  // overwriting the other via the {...entryProps} spread order — same
  // fix as Folder.tsx's identical shape.
  forceHover: externalForceHover = false,
  ...entryProps
}: NoteProps) {
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
        // forced while the Move picker is open, or when a caller asks for
        // it explicitly.
        forceHover={externalForceHover || menuOpen || moveTrigger.open || changeIconTrigger.open}
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
        }
      >
        {isEditing ? (
          <EditableText
            value={title ?? ''}
            placeholder={titlePlaceholder}
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
            {renderCompactMarkdown(title ?? '', { resolveWikiLink, resolveTag })}
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
