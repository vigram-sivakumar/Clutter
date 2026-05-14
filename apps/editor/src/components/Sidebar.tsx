import type { ReactNode } from "react";
import { useState } from "react";

import { SidebarTabs, type SidebarTabId } from "./SidebarTabs";

export type SidebarProps = {
  /** When false, spacer width is 0 and the panel is clipped (still in-tree, docked). */
  open: boolean;
  children?: ReactNode;
};

/** Single docked sidebar: `#clutter-sidebar` inside the layout spacer — no portal, no peek. */
export function Sidebar({ open, children }: SidebarProps) {
  const [workspaceTab, setWorkspaceTab] = useState<SidebarTabId>("notes");

  return (
    <div
      className="clutter-sidebar-spacer"
      data-expanded={open ? "true" : "false"}
      aria-hidden
    >
      <aside
        id="clutter-sidebar"
        className="clutter-app-sidebar"
        data-presentation="pinned"
        aria-label="Sidebar"
        aria-hidden={!open}
      >
        <div className="clutter-app-sidebar__inner">
          <SidebarTabs value={workspaceTab} onValueChange={setWorkspaceTab} />
          {children}
        </div>
      </aside>
    </div>
  );
}
