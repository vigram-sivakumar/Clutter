import type { PropertiesControl } from './propertiesControl';
import type { CoverCredit } from '@core/vault/models/PageMetadata';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@components/button/Button';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { PageHeaderMoreActionsMenu } from './PageHeaderMoreActionsMenu';
import './PageHeaderControls.css';

/** What a caller's extra control is given so its menu takes part in the row's single open-menu state. */
export interface HeaderControlMenu {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type HeaderMenuId = 'more' | 'extra';

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
   * gates the entire emoji capability: `undefined` for a page that
   * cannot change one (an archived page, a system folder), matching the same "handler presence decides
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
  onSetCoverImage?: (url: string, credit?: CoverCredit | null) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  onRemoveCoverImage?: () => void;
  /** Reveals an existing hidden cover in place — see PageHeaderMoreActionsMenu's own doc comment. */
  onShowCoverImage?: () => void;
  /** Forwarded to PageHeaderMoreActionsMenu's "Description" gate — see its own doc comment. */
  hasDescription?: boolean;
  onEditDescription?: () => void;
  /** Forwarded to the More-actions Properties control — see PropertiesControl. */
  propertiesControl?: PropertiesControl;
  /**
   * Further controls at the end of the row, after the More actions button — a generic slot, the caller decides
   * what fills it (a Daily Note puts its calendar button here). Absent, nothing extra is rendered. A function
   * receives the extra control's share of the row's open-menu state: the row has one, so the More menu and the
   * extra control's menu are never open together, and while either is open both buttons stay visible.
   */
  extraControls?: ReactNode | ((menu: HeaderControlMenu) => ReactNode);
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
  hasDescription,
  onEditDescription,
  propertiesControl,
  extraControls,
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

  // Which of the row's two menus is open, if either — one state, so opening one closes the other.
  const [openMenu, setOpenMenu] = useState<HeaderMenuId | null>(null);
  const menuState = (id: HeaderMenuId): HeaderControlMenu => ({
    open: openMenu === id,
    onOpenChange: (next) => setOpenMenu((current) => (next ? id : current === id ? null : current)),
  });

  return (
    // data-menu-open keeps both hover-revealed buttons visible while either menu is open (PageHeaderControls.css).
    <div className="page-header-controls" data-menu-open={openMenu !== null ? '' : undefined}>
      {emoji && !onSelectEmoji && (
        // Nothing here can change the icon (an archived page, say): it is shown, not offered.
        <span className="page-header-controls__emoji page-header-controls__emoji--static">
          <AppIcon emoji={emoji} />
        </span>
      )}
      {emoji && onSelectEmoji && (
        <>
          <Button
            className="page-header-controls__emoji"
            ref={emojiButtonRef}
            isIconOnly
            variant="ghost"
            interaction="subtle"
            aria-label="Change emoji"
            onClick={() => setEmojiPickerOpen(true)}
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
              onSelectEmoji(selected);
              setEmojiPickerOpen(false);
            }}
            onRemove={() => {
              onRemoveEmoji?.();
              setEmojiPickerOpen(false);
            }}
            />
        </>
      )}
      {extraControls && (
        <div className="page-header-controls__extra">
          {typeof extraControls === 'function' ? extraControls(menuState('extra')) : extraControls}
        </div>
      )}
      {icon && (
        <span className="page-header-controls__icon">
          <AppIcon icon={icon} size={64} strokeWidth={0.8} />
        </span>
      )}
      {showMoreActions && (
        <PageHeaderMoreActionsMenu
          {...menuState('more')}
          emoji={emoji}
          onSelectEmoji={onSelectEmoji}
          onRemoveEmoji={onRemoveEmoji}
          hasCoverImage={hasCoverImage}
          coverHidden={coverHidden}
          onSetCoverImage={onSetCoverImage}
          onSetCoverImageFromUpload={onSetCoverImageFromUpload}
          onRemoveCoverImage={onRemoveCoverImage}
          onShowCoverImage={onShowCoverImage}
          hasDescription={hasDescription}
          onEditDescription={onEditDescription}
          propertiesControl={propertiesControl}
        />
      )}
    </div>
  );
}
