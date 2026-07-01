import '../../design-system/styles/AppLayout.css';
import { Sidebar } from './Sidebar';
import { Page } from './Page';

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">{<Sidebar />}</aside>
      <main className="app-layout__page">{<Page />}</main>
    </div>
  );
}
