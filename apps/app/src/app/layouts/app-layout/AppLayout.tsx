import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { PageHost } from '../page/PageHost';
import type { Application } from '@core/application/Application';
import { useVault } from '@app/hooks/useVault';
import { useEffectivePageState } from '@app/hooks/useEffectivePageState';
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';

interface AppLayoutProps {
  application: Application;
}

export function AppLayout({ application }: AppLayoutProps) {
  // Single vault subscription for sibling Sidebar + PageHost re-renders.
  useVault(application.vault);
  // ADR-020, M3: EffectivePageState notifies on draft open/close/promotion
  // and on live session edits — none of which Vault.subscribe fires for
  // (drafts are deliberately outside Vault, ADR-017). Sidebar is the only
  // consumer today; PageHost doesn't read this projection.
  useEffectivePageState(application.effectivePageState);

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
