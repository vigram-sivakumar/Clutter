import type { PropertiesControl } from './propertiesControl';
import type { CoverCredit } from '@core/vault/models/PageMetadata';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@components/button/Button';
import { SpaceAvatarPicker } from '@components/space-avatar-picker/SpaceAvatarPicker';
import { PageIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { PageHeaderMoreActionsMenu, type CoverApplyResult } from './PageHeaderMoreActionsMenu';
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
  /** A strictly resolved local icon image URL; null means use the emoji/system fallback. */
  iconImageSrc?: string | null;
  /** Raw metadata presence, kept separate from resolution so an invalid reference still shows the fallback icon. */
  hasIconImage?: boolean;
  /** Generic page/folder icon shown if an image reference is invalid and no emoji exists. */
  fallbackIcon?: SystemIcon;
  /** Imports and persists an image selected from the user's computer. */
  onUploadIconImage?: (sourcePath: string) => CoverApplyResult;
  onIconImageError?: () => void;
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
  iconImageSrc,
  hasIconImage = false,
  fallbackIcon,
  onUploadIconImage,
  onIconImageError,
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
  // The same picker used by Space avatars provides emoji and local-image tabs.
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const hasUserIcon = Boolean(emoji || hasIconImage);

  // Which of the row's two menus is open, if either — one state, so opening one closes the other.
  const [openMenu, setOpenMenu] = useState<HeaderMenuId | null>(null);
  const menuState = (id: HeaderMenuId): HeaderControlMenu => ({
    open: openMenu === id,
    onOpenChange: (next) => setOpenMenu((current) => (next ? id : current === id ? null : current)),
  });

  return (
    // data-menu-open keeps both hover-revealed buttons visible while either menu is open (PageHeaderControls.css).
    <div className="page-header-controls" data-menu-open={openMenu !== null ? '' : undefined}>
      {hasUserIcon && onSelectEmoji && onUploadIconImage && (
        <>
          <Button
            className="page-header-controls__emoji"
            ref={iconButtonRef}
            isIconOnly
            variant="ghost"
            interaction="subtle"
            aria-label="Change page icon"
            onClick={() => setIconPickerOpen(true)}
          >
            <PageIcon
              emoji={emoji}
              systemIcon={fallbackIcon}
              imageSrc={iconImageSrc}
              onImageError={onIconImageError}
              size="large"
            />
          </Button>
          <SpaceAvatarPicker
            anchorRef={iconButtonRef}
            open={iconPickerOpen}
            onClose={() => setIconPickerOpen(false)}
            hasAvatar={hasUserIcon}
            onSelectEmoji={(selected) => {
              onSelectEmoji(selected);
              setIconPickerOpen(false);
            }}
            onUploadImage={(sourcePath) => {
              const result = onUploadIconImage(sourcePath);
              if (result instanceof Promise) {
                void result.then((applied) => {
                  if (applied !== false) setIconPickerOpen(false);
                }).catch(() => {});
              } else if (result !== false) {
                setIconPickerOpen(false);
              }
            }}
            onRemove={() => {
              onRemoveEmoji?.();
              setIconPickerOpen(false);
            }}
            alignment="start"
          />
        </>
      )}
      {hasUserIcon && (!onSelectEmoji || !onUploadIconImage) && (
        <span className="page-header-controls__emoji">
          <PageIcon
            emoji={emoji}
            systemIcon={fallbackIcon}
            imageSrc={iconImageSrc}
            onImageError={onIconImageError}
            size="large"
          />
        </span>
      )}
      {extraControls && (
        <div className="page-header-controls__extra">
          {typeof extraControls === 'function' ? extraControls(menuState('extra')) : extraControls}
        </div>
      )}
      {icon && (
        <span className="page-header-controls__icon">
          <PageIcon systemIcon={icon} size="large" />
        </span>
      )}
      {showMoreActions && (
        <PageHeaderMoreActionsMenu
          {...menuState('more')}
          emoji={emoji}
          onSelectEmoji={onSelectEmoji}
          onRemoveEmoji={onRemoveEmoji}
          hasIconImage={hasIconImage}
          onUploadIconImage={onUploadIconImage}
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
