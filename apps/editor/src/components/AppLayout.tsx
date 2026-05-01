import React from "react";
import { Topbar } from "./Topbar";

type SidepanelState = "expanded" | "collapsed" | "hidden";

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const [sidepanel] = React.useState<SidepanelState>("expanded");

  return (
    <div className="clutter-app">
      <Topbar />
      <div className="clutter-workspace" data-sidepanel={sidepanel}>
        <aside
          className={`clutter-sidepanel${sidepanel !== "expanded" ? ` clutter-sidepanel--${sidepanel}` : ""}`}
        />
        <main className="clutter-canvas">
          <div className="clutter-editor-group">
            <div className="clutter-editor-pane">
              <div className="clutter-editor-topbar" />
              <div className="clutter-editor-scroll">
                <div className="clutter-editor-document">
                  <div className="clutter-document-header" />
                  <div className="clutter-document-content">
                    {children}
                    <div className="clutter-document-footer" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
