import { useId } from "react";

import { CustomIcons, type ClutterIcon, ICON_MEDIUM } from "../design-system/icons";

export type SidebarTabId = "notes" | "journals" | "tasks" | "tags";

type TabDef = {
  id: SidebarTabId;
  label: string;
  Icon: ClutterIcon;
};

const TABS: TabDef[] = [
  { id: "notes", label: "Notes", Icon: CustomIcons.Note },
  { id: "journals", label: "Journals", Icon: CustomIcons.CalendarBlank },
  { id: "tasks", label: "Tasks", Icon: CustomIcons.SquareCheckOutline },
  { id: "tags", label: "Tags", Icon: CustomIcons.Tag },
];

export type SidebarTabsProps = {
  value: SidebarTabId;
  onValueChange: (id: SidebarTabId) => void;
};

/**
 * Workspace bar: tab rail (hugs tabs) + search.
 * Rail height `--height-2xl`; inactive tabs fill rail height with square aspect; active tab fills height and width hugs content.
 */
export function SidebarTabs({ value, onValueChange }: SidebarTabsProps) {
  const idPrefix = useId().replace(/:/g, "");

  return (
    <div className="clutter-sidebar-tabs">
      <div className="clutter-sidebar-tabs__strip">
        <div className="clutter-sidebar-tabs__rail" role="tablist" aria-label="Workspace">
          {TABS.map((tab) => {
            const active = value === tab.id;
            const { Icon } = tab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`${idPrefix}-tab-${tab.id}`}
                aria-label={tab.label}
                aria-selected={active}
                tabIndex={0}
                className={[
                  "clutter-sidebar-tabs__tab",
                  active ? "clutter-sidebar-tabs__tab--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onValueChange(tab.id)}
              >
                <span className="clutter-sidebar-tabs__tab-inner">
                  <span className="clutter-sidebar-tabs__tab-icon" aria-hidden>
                    <Icon width={ICON_MEDIUM} height={ICON_MEDIUM} aria-hidden />
                  </span>
                  <span className="clutter-sidebar-tabs__tab-label">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="clutter-sidebar-tabs__search" aria-label="Search">
        <span className="clutter-sidebar-tabs__search-icon" aria-hidden>
          <CustomIcons.MagnifyingGlass width={ICON_MEDIUM} height={ICON_MEDIUM} aria-hidden />
        </span>
      </button>
    </div>
  );
}
