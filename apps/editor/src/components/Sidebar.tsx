import type { ReactNode } from "react";

export type SidebarProps = {
  /** When false, spacer width is 0 and the panel is clipped (still in-tree, docked). */
  open: boolean;
  children?: ReactNode;
};

/** Single docked sidebar: `#clutter-sidebar` inside the layout spacer — no portal, no peek. */
export function Sidebar({ open, children }: SidebarProps) {
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
        <div className="clutter-app-sidebar__inner">{children}</div>
      </aside>
    </div>
  );
}
