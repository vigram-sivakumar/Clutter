import type React from "react";
import { GlobalTopbar } from "./GlobalTopbar";

type AppLayoutProps = {
  children?: React.ReactNode;
};

/**
 * Shell: global top bar + sidepanel + canvas with empty editor chrome (content added incrementally).
 */
export function AppLayout({ children: _children }: AppLayoutProps) {
  return (
    <div className="clutter-app">
      <GlobalTopbar />
      <div className="clutter-app-workspace" aria-label="Workspace">
        <div className="clutter-workspace" data-sidepanel="expanded">
          <aside className="clutter-sidepanel" aria-label="Side panel" />
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
