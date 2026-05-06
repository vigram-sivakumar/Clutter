import React from "react";
import { GlobalTopbar } from "./global-topbar/GlobalTopbar";
import { SidepanelLayout } from "./sidepanel/SidepanelLayout";
import { SidepanelFooter } from "./sidepanel/SidepanelFooter";
import { SidepanelNavList } from "./sidepanel/SidepanelNavList";
import { SidepanelTitle, type SidepanelTitleVariant } from "./sidepanel/SidepanelTitle";
import { SidepanelTabCalendar } from "./sidepanel/SidepanelTabCalendar";
import { SidepanelTabNotes } from "./sidepanel/SidepanelTabNotes";
import { SidepanelTabTasks } from "./sidepanel/SidepanelTabTasks";
import { SidepanelTabTags } from "./sidepanel/SidepanelTabTags";
import { Tabs, type TabId } from "./Tabs";
import { DocIcon } from "./document/DocIcon";

/** Calendar tab uses the Daily Notes title row; April/2026 lives in the calendar block. */
function sidepanelTitleVariantForTab(tab: TabId): SidepanelTitleVariant {
  switch (tab) {
    case "calendar":
      return "daily-notes";
    case "notes":
      return "notes";
    case "tasks":
      return "tasks";
    case "tags":
      return "tags";
    default:
      return "daily-notes";
  }
}

type SidepanelState = "expanded" | "collapsed" | "hidden";

type AppLayoutProps = {
  children: React.ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const [sidepanel] = React.useState<SidepanelState>("expanded");
  const [activeTab, setActiveTab] = React.useState<TabId>("calendar");

  return (
    <div className="clutter-app">
      <GlobalTopbar />
      <div className="clutter-workspace" data-sidepanel={sidepanel}>
        <aside
          className={`clutter-sidepanel${sidepanel !== "expanded" ? ` clutter-sidepanel--${sidepanel}` : ""}`}
        >
          <SidepanelLayout
            tabs={
              <Tabs
                direction={sidepanel === "collapsed" ? "vertical" : "horizontal"}
                value={activeTab}
                onValueChange={setActiveTab}
              />
            }
            titleRow={
              <SidepanelTitle variant={sidepanelTitleVariantForTab(activeTab)} />
            }
            navigation={<SidepanelNavList activeTab={activeTab} />}
            footer={<SidepanelFooter />}
            children={
              activeTab === "tasks" ? (
                <SidepanelTabTasks />
              ) : activeTab === "notes" ? (
                <SidepanelTabNotes />
              ) : activeTab === "tags" ? (
                <SidepanelTabTags />
              ) : (
                <SidepanelTabCalendar />
              )
            }
          />
        </aside>
        <main className="clutter-canvas">
          <div className="clutter-editor-group">
            <div className="clutter-editor-pane">
              <div className="clutter-editor-topbar" />
              <div className="clutter-editor-scroll">
                <div className="clutter-editor-document">
                  <div className="clutter-document-header">
                    <DocIcon type="icon" icon="CalendarBlank" />
                  </div>
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
