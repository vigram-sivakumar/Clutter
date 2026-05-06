import React from "react";
import { EmptyState } from "../EmptyState";
import { Header } from "../sidepanel-section/Header";
import { SectionGroupLayout } from "../sidepanel-section/SectionGroupLayout";
import { SectionLayout } from "../sidepanel-section/SectionLayout";
import { Subheader } from "../sidepanel-section/Subheader";

function formatTasksTodayDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function SidepanelTabTasks() {
  const [todayOpen, setTodayOpen] = React.useState(true);
  const [overdueOpen, setOverdueOpen] = React.useState(true);
  const [upcomingOpen, setUpcomingOpen] = React.useState(true);

  return (
    <div className="clutter-sidepanel-scroll-sections">
      <SectionLayout
        bottomPadding={todayOpen}
        header={
          <Header
            label="Today"
            expanded={todayOpen}
            onToggle={() => setTodayOpen((open) => !open)}
          />
        }
      >
        {todayOpen ? (
          <>
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
          </>
        ) : null}
      </SectionLayout>
      <SectionLayout
        bottomPadding={overdueOpen}
        header={
          <Header
            label="Overdue"
            expanded={overdueOpen}
            onToggle={() => setOverdueOpen((open) => !open)}
          />
        }
      >
        {overdueOpen ? (
          <SectionGroupLayout>
            <EmptyState type="inline" description="No overdue tasks" />
          </SectionGroupLayout>
        ) : null}
      </SectionLayout>
      <SectionLayout
        bottomPadding={upcomingOpen}
        header={
          <Header
            label="Upcoming"
            expanded={upcomingOpen}
            onToggle={() => setUpcomingOpen((open) => !open)}
          />
        }
      >
        {upcomingOpen ? (
          <SectionGroupLayout>
            <EmptyState type="inline" description="Nothing planned yet" />
          </SectionGroupLayout>
        ) : null}
      </SectionLayout>
    </div>
  );
}
