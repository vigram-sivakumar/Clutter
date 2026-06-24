import type { ReactNode } from 'react';
import '../../styles/app-layout.css';

type AppLayoutProps = {
  sidebar?: ReactNode;
  page?: ReactNode;
};

export function AppLayout({ sidebar, page }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidebar">{sidebar}</aside>
      <main className="app-layout__page">{page}</main>
    </div>
  );
}
