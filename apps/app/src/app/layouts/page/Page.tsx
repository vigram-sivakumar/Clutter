import type { ReactNode, RefObject } from 'react';
import type { SystemIcon } from '@shared/icon';
import './Page.css';
import { PageCover } from './cover/Page.Cover';
import { PageTopBar } from './topbar/Page.TopBar';
import { PageTitleSection } from './header/Page.TitleSection';
import { PageTitle } from './header/Page.Title';
import { PageDescription } from './header/Page.Description';

type PageProps = {
  title: string;
  description?: string;
  titleEditable?: boolean;
  titlePlaceholder?: string;
  breadcrumbs?: ReactNode;
  menu?: ReactNode;
  actions?: ReactNode;
  /**
   * Trailing slot beside the page title itself (PageTitleSection's own
   * `actions` prop) — distinct from `actions` above, which reaches
   * PageTopBar instead. Generic capability; only collection pages
   * currently supply anything here (the List/Table view menu).
   */
  titleActions?: ReactNode;
  /** Forwarded to PageTitleSection's own `emoji`/`icon`/`showMoreActions` — see that component's doc comment for the three page-header-controls configurations (user-owned, system-reserved, Daily Notes). PageHost decides which applies per page type; Page itself just forwards whatever it's given. */
  emoji?: string;
  icon?: SystemIcon;
  showMoreActions?: boolean;
  /** Forwarded to PageTitleSection's own More-actions menu — see PageHeaderControls' doc comments. Presence gates the Emoji/Cover image menu items (undefined omits the corresponding item entirely, e.g. a Daily Note never gets onSelectEmoji). */
  onSelectEmoji?(emoji: string): void;
  onRemoveEmoji?(): void;
  onSetCoverImage?(url: string): void;
  onSetCoverImageFromUpload?(sourcePath: string): void;
  body?: ReactNode;
  coverImage?: string;
  /** Forwarded to PageCover's "Remove" menu action AND to the More-actions "Cover image" picker's own removal — both clear the same underlying cover, see Page.Cover.tsx's own doc comment for the collapse-then-remove sequencing. */
  onRemoveCoverImage?(): void;
  /**
   * Forwarded to PageCover's `hidden` prop — the persisted `coverHidden`
   * metadata, not local state (see Page.Cover.tsx's own doc comment) —
   * and to PageTitleSection, which uses it to swap the More-actions
   * "Cover image" item for "Show cover image" once a cover is hidden.
   */
  coverHidden?: boolean;
  /** Forwarded to PageCover's "Hide" menu action. */
  onHideCoverImage?(): void;
  /** Forwarded to PageTitleSection's More-actions "Show cover image" item — reveals an existing hidden cover without opening the picker. */
  onShowCoverImage?(): void;
  /**
   * A handle onto whatever's rendered in `body`, so title's Enter can
   * advance focus into it — Page doesn't need to know what body actually
   * is (MarkdownEditor today, a future page type's own editing surface
   * later), only that it can be focused.
   */
  bodyFocusRef?: RefObject<{ focus(): void; focusAtNewLineAtStart(): void } | null>;
  /**
   * Fired when a changed title commits (see PageTitle.onCommit). Supplied
   * by the draft branch and the folder branch (FolderOperations.rename(),
   * ADR-024) — both discrete-commit consumers. A persisted Note supplies
   * onTitleEdit/onTitleFlush instead (below), not this.
   */
  onTitleCommit?(title: string): void;
  /** See PageTitle.onEdit — the continuous-commit entry point for a channel-backed title (persisted Note, folder). */
  onTitleEdit?(title: string): void;
  /** See PageTitle.onFlush — the non-escaped-blur-flush entry point for a channel-backed title. */
  onTitleFlush?(): void;
  /** See PageTitle.onCancel — the Escape entry point for a channel-backed title, reverting its pending value. */
  onTitleCancel?(): void;
  /**
   * Forwarded to PageTopBar's history buttons — the Workspace-owned
   * navigation-history state and NavigationRouter.back()/forward() handlers
   * of ADR-027, which PageHost resolves and passes down. Optional so
   * Page's own tests and any caller that doesn't care about history state
   * shouldn't be forced to supply them.
   */
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?(): void;
  onNavigateForward?(): void;
  /**
   * React key for the title's EditableText, not for Page itself — PageHost
   * used to key the whole <Page> by activePageId so a fresh PageTitle
   * remounts per page (EditableText's autoFocus is deliberately mount-once,
   * per the commit that introduced this: "without it, navigating between
   * two persisted pages ... would silently stop the autofocus-on-missing-
   * title behavior from re-firing"). Scoping the key to just PageTitle
   * keeps that autofocus behavior without remounting the rest of Page on
   * every navigation.
   */
  titleKey?: string;
};

export function Page({
  title,
  description,
  titleEditable,
  titlePlaceholder,
  breadcrumbs,
  menu,
  actions,
  titleActions,
  emoji,
  icon,
  showMoreActions,
  onSelectEmoji,
  onRemoveEmoji,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  body,
  coverImage,
  onRemoveCoverImage,
  coverHidden,
  onHideCoverImage,
  onShowCoverImage,
  bodyFocusRef,
  onTitleCommit,
  onTitleEdit,
  onTitleFlush,
  onTitleCancel,
  // PageTopBar requires these four, so the defaults stand in for a caller
  // that omitted them: "no history in either direction," which renders both
  // buttons disabled and therefore makes the no-op handlers unreachable.
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack = () => {},
  onNavigateForward = () => {},
  titleKey,
}: PageProps) {
  // The one place "is this entity missing its title" is decided for the
  // editing/identity surface — driven entirely by the title string the
  // caller already resolved (empty means missing, per the same
  // isAutoGeneratedName-based convention toResourcePageModel/
  // getPageDisplayLabel/getFolderDisplayLabel each apply), not by any
  // page-type knowledge Page itself would otherwise need.
  const shouldAutoFocusTitle = Boolean(titleEditable) && title === '';

  return (
    <div className="page">
      <div className="page__document">
        <PageTopBar
          breadcrumbs={breadcrumbs}
          menu={menu}
          actions={actions}
          canNavigateBack={canNavigateBack}
          canNavigateForward={canNavigateForward}
          onNavigateBack={onNavigateBack}
          onNavigateForward={onNavigateForward}
        />
        <div className="page__content">
          <header className="page__header">
            <PageTitleSection
              title={
                <PageTitle
                  key={titleKey}
                  editable={titleEditable}
                  placeholder={titlePlaceholder}
                  autoFocus={shouldAutoFocusTitle}
                  onSubmit={() => bodyFocusRef?.current?.focusAtNewLineAtStart()}
                  onCommit={onTitleCommit}
                  onEdit={onTitleEdit}
                  onFlush={onTitleFlush}
                  onCancel={onTitleCancel}
                >
                  {title}
                </PageTitle>
              }
              description={description && <PageDescription>{description}</PageDescription>}
              actions={titleActions}
              emoji={emoji}
              icon={icon}
              showMoreActions={showMoreActions}
              onSelectEmoji={onSelectEmoji}
              onRemoveEmoji={onRemoveEmoji}
              hasCoverImage={Boolean(coverImage)}
              coverHidden={coverHidden}
              onSetCoverImage={onSetCoverImage}
              onSetCoverImageFromUpload={onSetCoverImageFromUpload}
              onRemoveCoverImage={onRemoveCoverImage}
              onShowCoverImage={onShowCoverImage}
            />
          </header>
          <main className="page__body">{body}</main>
        </div>
      </div>
      {coverImage && (
        <PageCover
          src={coverImage}
          onRemove={onRemoveCoverImage}
          hidden={coverHidden}
          onHide={onHideCoverImage}
        />
      )}
    </div>
  );
}
