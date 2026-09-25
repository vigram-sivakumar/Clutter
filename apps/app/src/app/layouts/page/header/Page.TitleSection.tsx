import type { HTMLAttributes, ReactNode } from 'react';
import { PageHeaderControls } from './PageHeaderControls';
import type { SystemIcon } from '@shared/icon';
import './Page.TitleSection.css';

interface PageTitleSectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'title'
> {
  title: ReactNode;
  description?: ReactNode;
  /**
   * The page's own emoji, if it has one — forwarded to PageHeaderControls.
   * Every page type may have one; not collection-specific. Mutually
   * exclusive with `icon` in practice, decided by the caller (PageHost),
   * not inferred here — PageTitleSection stays reusable for any page type
   * by only ever forwarding whatever configuration it's given.
   */
  emoji?: string;
  /** A fixed system icon (Assets, Archive, Favorites, ...) — see PageHeaderControls' own doc comment. */
  icon?: SystemIcon;
  /** Whether the More actions button renders at all — see PageHeaderControls' own doc comment. Defaults to `true`. */
  showMoreActions?: boolean;
  /** Forwarded to PageHeaderControls — see its own doc comments for the full More-actions/emoji/cover-image wiring. */
  onSelectEmoji?: (emoji: string) => void;
  onRemoveEmoji?: () => void;
  /** Whether the page currently has a cover image — no header preview/control, just gates the More-actions "Cover image" item. See PageHeaderControls' own doc comment. */
  hasCoverImage?: boolean;
  /** Whether an existing cover is currently suppressed from view — see PageHeaderControls' own doc comment. */
  coverHidden?: boolean;
  onSetCoverImage?: (url: string) => void;
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  onRemoveCoverImage?: () => void;
  /** Reveals an existing hidden cover in place — see PageHeaderControls' own doc comment. */
  onShowCoverImage?: () => void;
  /**
   * Trailing slot beside the title — same `actions?: ReactNode` pattern as
   * PageTopBar's own `actions` prop. Generic (not collection-specific);
   * Page.tsx's own `titleActions` prop is what a caller uses to supply
   * this, and only collection pages currently pass anything through it.
   */
  actions?: ReactNode;
  /**
   * Generic slot rendered below `description`, inside `.page-title-section__content`
   * — same "PageTitleSection stays reusable, caller decides what fills it"
   * pattern as `actions` above. Only Daily Notes (PageHost) currently pass
   * anything through it (the [Calendar] [←] [Today] [→] row).
   */
  belowDescription?: ReactNode;
}

export function PageTitleSection({
  title,
  description,
  emoji,
  icon,
  showMoreActions,
  onSelectEmoji,
  onRemoveEmoji,
  hasCoverImage,
  coverHidden,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  onRemoveCoverImage,
  onShowCoverImage,
  actions,
  belowDescription,
  className,
  ...props
}: PageTitleSectionProps) {
  return (
    <header
      className={['page-title-section', className].filter(Boolean).join(' ')}

      {...props}
    >
      <PageHeaderControls
        emoji={emoji}
        icon={icon}
        showMoreActions={showMoreActions}
        onSelectEmoji={onSelectEmoji}
        onRemoveEmoji={onRemoveEmoji}
        hasCoverImage={hasCoverImage}
        coverHidden={coverHidden}
        onSetCoverImage={onSetCoverImage}
        onSetCoverImageFromUpload={onSetCoverImageFromUpload}
        onRemoveCoverImage={onRemoveCoverImage}
        onShowCoverImage={onShowCoverImage}
      />

      <div className="page-title-section__content">
        <div className="page-title-section__row">
          {title}

          {actions && (
            <div className="page-title-section__actions">{actions}</div>
          )}
        </div>

        {description}
        {belowDescription}
      </div>
    </header>
  );
}
