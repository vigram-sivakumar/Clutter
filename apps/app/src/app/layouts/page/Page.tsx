import { useState, type ReactNode } from 'react';
import './Page.css';
import { PageCover } from './cover/Page.Cover';
import { PageTopBar } from './topbar/Page.TopBar';
import { PageTitleSection } from './header/Page.TitleSection';
import { PageTitle } from './header/Page.Title';
import { PageDescription } from './header/Page.Description';
import { References } from './reference/Reference';

type PageProps = {
  title: string;
  description?: string;
  titleEditable?: boolean;
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
  breadcrumbs,
  menu,
  actions,
  body,
  coverImage,
}: PageProps) {
  const [referencesExpanded, setReferencesExpanded] = useState(false);

  return (
    <div className="page">
      <div className="page__document">
        <PageTopBar breadcrumbs={breadcrumbs} menu={menu} actions={actions} />
        <div className="page__content">
          <header className="page__header">
            <PageTitleSection>
              <PageTitle editable={titleEditable}>{title}</PageTitle>
              {description && <PageDescription>{description}</PageDescription>}
            </PageTitleSection>
          </header>
          <main className="page__body">{body}</main>
          <footer className="page__footer">
            <References
              isExpanded={referencesExpanded}
              onExpandToggle={() => setReferencesExpanded((expanded) => !expanded)}
            />
          </footer>
        </div>
      </div>
      {coverImage && <PageCover src={coverImage} />}
    </div>
  );
}
