import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { PageHeaderMoreActionsMenu } from './PageHeaderMoreActionsMenu';
import './PageHeaderControls.css';

export interface PageHeaderControlsProps {
  /**
   * A user-set emoji (a Note/Folder/Tag's own metadata icon) — shown
   * always when present, and independently editable via its own "Change
   * emoji" button. The caller decides whether this or `icon` applies
   * (PageHeaderControls doesn't infer page type itself); in practice the
   * two are mutually exclusive, never both passed for the same page.
   */
  emoji?: string;
  /**
   * A fixed system icon (Assets, Templates, Tasks, Favorites, Archive,
   * Workspace, ...) — always shown, and never interactive (there's
   * nothing for the user to change), unlike `emoji`'s own button.
   */
  icon?: SystemIcon;
  /**
   * Whether the More actions button renders at all. Omitted entirely
   * (not just hover-hidden — see Page.TitleSection.css's own `:hover`
   * rule) for a system-reserved page, which has no page-level actions
   * menu. Defaults to `true`.
   */
  showMoreActions?: boolean;
  /**
   * Persists a newly-picked emoji (FolderOperations.updateMetadata /
   * PageOperations.updateMetadata, both already the one existing write
   * path — see PageHeaderMoreActionsMenu's own doc comment). Presence
   * gates the entire emoji capability: `undefined` for a Daily Note,
   * which never offers one, matching the same "handler presence decides
   * whether the affordance exists" convention `onSetCoverImage` below
   * already uses.
   */
  onSelectEmoji?: (emoji: string) => void;
  onRemoveEmoji?: () => void;
  /**
   * Whether the page currently has a cover image — there is no cover
   * control/preview in the header itself (the cover renders wherever it
   * already does, e.g. PageCover); this only tells
   * PageHeaderMoreActionsMenu whether to keep offering "Cover image" or
   * hide it once one is already set, same convention `emoji` above uses
   * for the "Emoji" item.
   */
  hasCoverImage?: boolean;
  /** Whether an existing cover is currently suppressed from view — see PageHeaderMoreActionsMenu's own doc comment for how this swaps "Cover image" for "Show cover image". */
  coverHidden?: boolean;
  onSetCoverImage?: (url: string) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  onRemoveCoverImage?: () => void;
  /** Reveals an existing hidden cover in place — see PageHeaderMoreActionsMenu's own doc comment. */
  onShowCoverImage?: () => void;
}

export function PageHeaderControls({
  emoji,
  icon,
  showMoreActions = true,
  onSelectEmoji,
  onRemoveEmoji,
  hasCoverImage = false,
  coverHidden = false,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  onRemoveCoverImage,
  onShowCoverImage,
}: PageHeaderControlsProps) {
  // The one already-set-emoji entry point — "Clicking the visible emoji
  // opens the picker directly, without opening More Actions first." Same
  // ChangeIconPicker (Popover + EmojiTray) every sidebar row already uses
  // (Folder.tsx/Note.tsx/Tag.tsx) — not a second implementation, just a
  // new anchor. Kept independent of PageHeaderMoreActionsMenu's own
  // in-place Emoji view below, which only ever exists to *set* a first
  // emoji, never to change an existing one.
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="page-header-controls">
      {emoji && (
        <>
          <Button
            className="page-header-controls__emoji"
            ref={emojiButtonRef}
            isIconOnly
            variant="ghost"
            interaction="subtle"
            aria-label="Change emoji"
            onClick={onSelectEmoji ? () => setEmojiPickerOpen(true) : undefined}
          >
            <AppIcon emoji={emoji} />
          </Button>
          <ChangeIconPicker
            anchorRef={emojiButtonRef}
            open={emojiPickerOpen}
            onClose={() => setEmojiPickerOpen(false)}
            hasIcon
            side="bottom"
            alignment="start"
            onSelect={(selected) => {
              onSelectEmoji?.(selected);
              setEmojiPickerOpen(false);
            }}
            onRemove={() => {
              onRemoveEmoji?.();
              setEmojiPickerOpen(false);
            }}
          />
        </>
      )}
      {icon && (
        <span className="page-header-controls__icon">
          <AppIcon icon={icon} size={72} />
        </span>
      )}
      {showMoreActions && (
        <PageHeaderMoreActionsMenu
          emoji={emoji}
          onSelectEmoji={onSelectEmoji}
          onRemoveEmoji={onRemoveEmoji}
          hasCoverImage={hasCoverImage}
          coverHidden={coverHidden}
          onSetCoverImage={onSetCoverImage}
          onSetCoverImageFromUpload={onSetCoverImageFromUpload}
          onRemoveCoverImage={onRemoveCoverImage}
          onShowCoverImage={onShowCoverImage}
        />
      )}
    </div>
  );
}
