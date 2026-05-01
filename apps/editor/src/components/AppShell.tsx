import React from "react";
import { Topbar } from "./Topbar";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="clutter-app">
      <Topbar />

      <div className="clutter-workspace">
        {/* <aside className="clutter-sidebar" /> */}

        <main className="clutter-canvas">
          <div className="clutter-editor-pane">
            <div className="clutter-document-scroll">
              <div className="clutter-document">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
