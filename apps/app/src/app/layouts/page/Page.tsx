import type { ReactNode } from 'react';
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
}: PageProps) {
  return (
    <div className="page">
      <div className="page__document">
        <PageTopBar breadcrumbs={breadcrumbs} menu={menu} actions={actions} />
        <div className="page__content">
          <header className="page__header">
            <PageTitleSection>
              <PageTitle editable={titleEditable} placeholder={titlePlaceholder}>
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
