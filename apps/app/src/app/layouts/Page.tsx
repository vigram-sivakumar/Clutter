import type { ReactNode } from 'react';
import '../../design-system/styles/Page.css';

type PageProps = {
  children?: ReactNode;
  cover?: ReactNode;
};

export function Page({ children, cover }: PageProps) {
  return (
    <div className="page">
      <main className="page__content">{children}</main>
      {cover && <aside className="page__cover">{cover}</aside>}
    </div>
  );
}
