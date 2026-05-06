import React from "react";
import { EmptyState } from "../EmptyState";
import { Header } from "../sidepanel-section/Header";
import { SectionGroupLayout } from "../sidepanel-section/SectionGroupLayout";
import { SectionLayout } from "../sidepanel-section/SectionLayout";

/** Calendar tab — collapsible `Header` + empty line (Daily Notes in title row). */
const SECTION = {
  title: "Earlier",
  emptyDescription: "No calendar entries yet",
} as const;

export function SidepanelTabCalendar() {
  const [sectionExpanded, setSectionExpanded] = React.useState(true);

  return (
    <SectionLayout
      bottomPadding={sectionExpanded}
      header={
        <Header
          label={SECTION.title}
          expanded={sectionExpanded}
          onToggle={() => setSectionExpanded((open) => !open)}
        />
      }
    >
      {sectionExpanded ? (
        <SectionGroupLayout>
          <EmptyState type="inline" description={SECTION.emptyDescription} />
        </SectionGroupLayout>
      ) : null}
    </SectionLayout>
  );
}
