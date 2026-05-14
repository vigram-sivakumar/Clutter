import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";

type AppLayoutProps = {
  children?: ReactNode;
};

/** Shell: top bar + docked sidebar + canvas. Rail show/hide is instant (no peek / portal). */
export function AppLayout({ children: _children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open);
  }, []);

  return (
    <div className="clutter-app">
      <Topbar sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      <div className="clutter-app-frame" aria-label="Editor layout">
        <div className="clutter-frame" data-sidebar={sidebarOpen ? "expanded" : "hidden"}>
          <Sidebar open={sidebarOpen} />
          <main className="clutter-canvas">
            <div className="clutter-editor-group">
              <div className="clutter-editor-pane" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
