import type { ReactNode, RefObject } from 'react';
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
  body?: ReactNode;
  coverImage?: string;
  /**
   * A handle onto whatever's rendered in `body`, so title's Enter can
   * advance focus into it — Page doesn't need to know what body actually
   * is (MarkdownEditor today, a future page type's own editing surface
   * later), only that it can be focused.
   */
  bodyFocusRef?: RefObject<{ focus(): void } | null>;
  /**
   * Fired when a changed title commits (see PageTitle.onCommit). Supplied
   * by the draft branch and, since ADR-024, the folder branch
   * (FolderOperations.rename()) — persisted-page rename still has no
   * backing capability yet (ADR-012) and leaves this unset.
   */
  onTitleCommit?(title: string): void;
};

export function Page({
  title,
  description,
  titleEditable,
  titlePlaceholder,
  breadcrumbs,
  menu,
  actions,
  body,
  coverImage,
  bodyFocusRef,
  onTitleCommit,
}: PageProps) {
  // The one place "is this entity missing its title" is decided for the
  // editing/identity surface — driven entirely by the title string the
  // caller already resolved (empty means missing, per the same convention
  // isNoteUntitled/getPageDisplayLabel established), not by any page-type
  // knowledge Page itself would otherwise need.
  const shouldAutoFocusTitle = Boolean(titleEditable) && title === '';

  return (
    <div className="page">
      <div className="page__document">
        <PageTopBar breadcrumbs={breadcrumbs} menu={menu} actions={actions} />
        <div className="page__content">
          <header className="page__header">
            <PageTitleSection>
              <PageTitle
                editable={titleEditable}
                placeholder={titlePlaceholder}
                autoFocus={shouldAutoFocusTitle}
                onSubmit={() => bodyFocusRef?.current?.focus()}
                onCommit={onTitleCommit}
              >
                {title}
              </PageTitle>
              {description && <PageDescription>{description}</PageDescription>}
            </PageTitleSection>
          </header>
          <main className="page__body">{body}</main>
        </div>
      </div>
      {coverImage && <PageCover src={coverImage} />}
    </div>
  );
}
