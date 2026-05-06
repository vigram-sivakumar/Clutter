import { EmptyState } from "../EmptyState";
import { SectionGroupLayout } from "../sidepanel-section/SectionGroupLayout";
import { SectionLayout } from "../sidepanel-section/SectionLayout";

export function SidepanelTabTags() {
  return (
    <SectionLayout bottomPadding>
      <SectionGroupLayout>
        <EmptyState type="inline" description="No Tags yet" />
      </SectionGroupLayout>
    </SectionLayout>
  );
}
