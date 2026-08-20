import { CountBadge } from '@components/count-badge/CountBadge';
import { Entry, EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useChangeIconTrigger } from '@components/change-icon-picker/useChangeIconTrigger';
import { AppIcon } from '@shared/icon';
import './Tag.css';

interface TagProps extends Omit<EntryProps, 'children'> {
  title?: string;
  emoji?: string | null;
  count?: number;
  isFavorite?: boolean;

  /** Renders the title as an EditableText field instead of static text. */
  isEditing?: boolean;
  /**
   * Discrete-commit entry point (see EditableText.onCommit) — a Tag
   * rename has no debounced-autosave channel of its own (unlike a Note/
   * Folder title): it can rewrite Markdown across many pages per commit,
   * so it only ever fires once, on Enter or a changed blur, never per
   * keystroke.
   *
   * Returning `false` rejects the value (empty/invalid name) — forwarded
   * straight through to EditableText's own `onCommit`, unchanged, so an
   * empty rename shakes and stays open instead of silently exiting edit
   * mode with nothing persisted.
   */
  onTitleCommit?(value: string): void | boolean;
  /** Fired specifically on Escape — see EditableText.onCancel. */
  onTitleCancel?(): void;
  /** Fired when the rename session ends (committed or not) — the row's own signal to leave edit mode. */
  onTitleEditingEnd?(): void;

  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;
  onChangeIcon?: (emoji: string | null) => void;
}

export function Tag({
  title,
  emoji,
  count,
  isFavorite = false,
  isEditing = false,
  onTitleCommit,
  onTitleCancel,
  onTitleEditingEnd,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  onChangeIcon,
  forceHover: externalForceHover = false,
  ...entryProps
}: TagProps) {
  const changeIconTrigger = useChangeIconTrigger(onChangeIcon !== undefined);
  const triggerRef = changeIconTrigger.triggerRef;

  return (
    <>
      <Entry
        {...entryProps}
        forceHover={externalForceHover || menuOpen || changeIconTrigger.open}
        leading={<AppIcon className="tag__icon" icon="tag" emoji={emoji} />}
        trailing={<CountBadge count={count} />}
        actions={
          menuItems && menuItems.length > 0 ? (
            <OverflowMenu
              items={menuItems}
              triggerRef={triggerRef}
              open={menuOpen}
              onOpenChange={onMenuOpenChange ?? (() => {})}
              onSelect={(id) =>
                changeIconTrigger.handleSelect(id, onMenuSelect ?? (() => {}))
              }
              side="bottom"
              alignment="start"
            />
          ) : undefined
        }
      >
        {isEditing ? (
          <EditableText
            value={title ?? ''}
            autoFocus
            onCommit={onTitleCommit ?? (() => {})}
            onCancel={onTitleCancel}
            onEditingEnd={onTitleEditingEnd}
          />
        ) : (
          title
        )}
      </Entry>
      {onChangeIcon !== undefined && (
        <ChangeIconPicker
          anchorRef={triggerRef}
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
