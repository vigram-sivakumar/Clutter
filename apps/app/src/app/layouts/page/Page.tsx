import type { ReactNode } from 'react';
import './Page.css';

type PageProps = {
  topBar?: ReactNode;
  header?: ReactNode;
  tabs?: ReactNode;
  body?: ReactNode;
  references?: ReactNode;
  cover?: ReactNode;
};

export function Page({
  topBar,
  header,
  tabs,
  body,
  references,
  cover,
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
      {cover && <aside className="page__cover">{cover}</aside>}
    </div>
  );
}
