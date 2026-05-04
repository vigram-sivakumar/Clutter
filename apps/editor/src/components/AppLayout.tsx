import React from "react";
import { GlobalTopbar } from "./global-topbar/GlobalTopbar";
import { SidepanelLayout } from "./sidepanel/SidepanelLayout";
import { SidepanelFooter } from "./sidepanel/SidepanelFooter";
import { SidepanelTabNav } from "./sidepanel/SidepanelTabNav";
import { SidepanelTitle, type SidepanelTitleVariant } from "./sidepanel/SidepanelTitle";
import { Tabs, type TabId } from "./Tabs";
import { EmptyState } from "./EmptyState";
import { Header } from "./section/Header";
import { SectionGroupLayout } from "./section/SectionGroupLayout";
import { SectionLayout } from "./section/SectionLayout";
import { Subheader } from "./section/Subheader";

/** Calendar tab — collapsible `Header` + empty line. Notes / Tasks use multi-section layouts; Tags has no section header. */
const CALENDAR_SIDEPANEL_SECTION = {
  title: "Earlier",
  emptyDescription: "No calendar entries yet",
} as const;

/** Tasks “Today” group — subheader pill shows calendar day as `DD MMM` (e.g. `03 May`). */
function formatTasksTodayDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

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
  const [sidepanelSectionExpanded, setSidepanelSectionExpanded] = React.useState(true);
  const [notesFavoritesOpen, setNotesFavoritesOpen] = React.useState(true);
  const [notesFoldersOpen, setNotesFoldersOpen] = React.useState(true);
  const [tasksTodayOpen, setTasksTodayOpen] = React.useState(true);
  const [tasksOverdueOpen, setTasksOverdueOpen] = React.useState(true);
  const [tasksUpcomingOpen, setTasksUpcomingOpen] = React.useState(true);

  React.useEffect(() => {
    setSidepanelSectionExpanded(true);
    setNotesFavoritesOpen(true);
    setNotesFoldersOpen(true);
    setTasksTodayOpen(true);
    setTasksOverdueOpen(true);
    setTasksUpcomingOpen(true);
  }, [activeTab]);

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
            navigation={<SidepanelTabNav activeTab={activeTab} />}
            footer={<SidepanelFooter />}
            children={
              <div className="clutter-empty-state-host">
                {activeTab === "tasks" ? (
                  <div className="clutter-sidepanel-scroll-sections">
                    <SectionLayout
                      bottomPadding={tasksTodayOpen}
                      header={
                        <Header
                          label="Today"
                          expanded={tasksTodayOpen}
                          onToggle={() =>
                            setTasksTodayOpen((open) => !open)
                          }
                        />
                      }
                    >
                      {tasksTodayOpen ? (
                        <SectionGroupLayout
                          subheader={
                            <Subheader
                              text={formatTasksTodayDate()}
                              dot
                              labelAppearance="pill"
                            />
                          }
                        >
                          <EmptyState
                            type="inline"
                            description="No tasks for today or All done for today"
                          />
                        </SectionGroupLayout>
                      ) : null}
                    </SectionLayout>
                    <SectionLayout
                      bottomPadding={tasksOverdueOpen}
                      header={
                        <Header
                          label="Overdue"
                          expanded={tasksOverdueOpen}
                          onToggle={() =>
                            setTasksOverdueOpen((open) => !open)
                          }
                        />
                      }
                    >
                      {tasksOverdueOpen ? (
                        <SectionGroupLayout>
                          <EmptyState
                            type="inline"
                            description="No overdue tasks"
                          />
                        </SectionGroupLayout>
                      ) : null}
                    </SectionLayout>
                    <SectionLayout
                      bottomPadding={tasksUpcomingOpen}
                      header={
                        <Header
                          label="Upcoming"
                          expanded={tasksUpcomingOpen}
                          onToggle={() =>
                            setTasksUpcomingOpen((open) => !open)
                          }
                        />
                      }
                    >
                      {tasksUpcomingOpen ? (
                        <SectionGroupLayout>
                          <EmptyState
                            type="inline"
                            description="Nothing planned yet"
                          />
                        </SectionGroupLayout>
                      ) : null}
                    </SectionLayout>
                  </div>
                ) : activeTab === "notes" ? (
                  <div className="clutter-sidepanel-scroll-sections">
                    <SectionLayout
                      bottomPadding={notesFavoritesOpen}
                      header={
                        <Header
                          label="Favorites"
                          expanded={notesFavoritesOpen}
                          onToggle={() =>
                            setNotesFavoritesOpen((open) => !open)
                          }
                        />
                      }
                    >
                      {notesFavoritesOpen ? (
                        <SectionGroupLayout>
                          <EmptyState
                            type="inline"
                            description="Star notes or folders to see them here"
                          />
                        </SectionGroupLayout>
                      ) : null}
                    </SectionLayout>
                    <SectionLayout
                      bottomPadding={notesFoldersOpen}
                      header={
                        <Header
                          label="Folders"
                          expanded={notesFoldersOpen}
                          onToggle={() =>
                            setNotesFoldersOpen((open) => !open)
                          }
                        />
                      }
                    >
                      {notesFoldersOpen ? (
                        <SectionGroupLayout>
                          <EmptyState
                            type="inline"
                            description="No Folders yet"
                          />
                        </SectionGroupLayout>
                      ) : null}
                    </SectionLayout>
                  </div>
                ) : activeTab === "tags" ? (
                  <SectionLayout bottomPadding>
                    <SectionGroupLayout>
                      <EmptyState type="inline" description="No Tags yet" />
                    </SectionGroupLayout>
                  </SectionLayout>
                ) : (
                  <SectionLayout
                    bottomPadding={sidepanelSectionExpanded}
                    header={
                      <Header
                        label={CALENDAR_SIDEPANEL_SECTION.title}
                        expanded={sidepanelSectionExpanded}
                        onToggle={() =>
                          setSidepanelSectionExpanded((open) => !open)
                        }
                      />
                    }
                  >
                    {sidepanelSectionExpanded ? (
                      <SectionGroupLayout>
                        <EmptyState
                          type="inline"
                          description={
                            CALENDAR_SIDEPANEL_SECTION.emptyDescription
                          }
                        />
                      </SectionGroupLayout>
                    ) : null}
                  </SectionLayout>
                )}
              </div>
            }
          />
        </aside>
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
