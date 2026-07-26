import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
import type { Application } from '@core/application/Application';

interface AppLayoutProps {
  application: Application;
}

export function AppLayout({ application }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">
        {<Sidebar application={application} />}
      </aside>
      <main className="app-layout__page">
        <PageHost application={application} />
      </main>
    </div>
  );
}
