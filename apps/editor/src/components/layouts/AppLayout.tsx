import '../../styles/app-layout.css';
import { SidePanel } from './SidePanel';
import { PageLayout } from './PageLayout';

export function AppLayout() {
  return (
    <div className="app-layout">
      <aside className="app-layout__sidepanel">{<SidePanel />}</aside>
      <main className="app-layout__page">{<PageLayout />}</main>
    </div>
  );
}
