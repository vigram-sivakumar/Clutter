import type { ReactNode } from 'react';
import '../../styles/page-layout.css';

type PageLayoutProps = {
  children?: ReactNode;
  cover?: ReactNode;
};

export function PageLayout({ children, cover }: PageLayoutProps) {
  return (
    <div className="page">
      <main className="page__content">{children}</main>
      {cover && <aside className="page__cover">{cover}</aside>}
    </div>
  );
}
