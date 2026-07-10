import type { ReactNode } from 'react';
import './Page.css';
import { PageCover } from './cover/Page.Cover';

type PageProps = {
  topBar?: ReactNode;
  header?: ReactNode;
  tabs?: ReactNode;
  body?: ReactNode;
  references?: ReactNode;
  coverImage?: string;
};

export function Page({
  topBar,
  header,
  tabs,
  body,
  references,
  coverImage,
}: PageProps) {
  return (
    <div className="page">
      <div className="page__content">
        {topBar}
        {header && <header className="page__header">{header}</header>}
        {tabs && <nav className="page__tabs">{tabs}</nav>}
        {body && <main className="page__body">{body}</main>}
        {references && <aside className="page__references">{references}</aside>}
      </div>
      {coverImage && <PageCover src={coverImage} />}
    </div>
  );
}
