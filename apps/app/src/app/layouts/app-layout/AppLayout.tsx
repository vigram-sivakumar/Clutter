import './AppLayout.css';
import { Sidebar } from '../sidebar/Sidebar';
import { MockPage } from '../page/mockPage';
// import { Page } from '../page/Page';

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">{<Sidebar />}</aside>
      {/* <main className="app-layout__page">{<Page />}</main> */}
      <main className="app-layout__page">{<MockPage />}</main>
    </div>
  );
}
