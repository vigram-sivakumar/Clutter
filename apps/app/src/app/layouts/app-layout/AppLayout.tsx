import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { MockPage } from '../page/mockPage';
import type { Vault } from '@core/vault/models';
// import { Page } from '../page/Page';

interface AppLayoutProps {
  vault: Vault;
}

export function AppLayout({ vault }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">
        {<Sidebar vault={vault} />}
      </aside>
      {/* <main className="app-layout__page">{<Page />}</main> */}
      <main className="app-layout__page">{<MockPage />}</main>
    </div>
  );
}
