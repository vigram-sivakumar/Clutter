import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
import type { Application } from '@core/application/Application';
import { useVault } from '@app/hooks/useVault';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';

interface AppLayoutProps {
  application: Application;
}

export function AppLayout({ application }: AppLayoutProps) {
  // Single vault subscription for sibling Sidebar + PageHost re-renders.
  useVault(application.vault);

  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">
        <TauriDragStrip />
        {<Sidebar application={application} />}
      </aside>
      <main className="app-layout__page">
        <TauriDragStrip />
        <PageHost application={application} />
      </main>
    </div>
  );
}
