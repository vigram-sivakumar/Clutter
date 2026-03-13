import React from "react";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="clutter-app">
      <aside className="clutter-sidebar">

      </aside>

      <div className="clutter-main">
        <header className="clutter-topbar">

        </header>

        <div className="clutter-container">
          <div className="clutter-note">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
