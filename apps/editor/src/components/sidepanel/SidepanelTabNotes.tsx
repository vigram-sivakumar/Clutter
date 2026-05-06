import React from "react";
import { EmptyState } from "../EmptyState";
import { Header } from "../sidepanel-section/Header";
import { SectionGroupLayout } from "../sidepanel-section/SectionGroupLayout";
import { SectionLayout } from "../sidepanel-section/SectionLayout";

export function SidepanelTabNotes() {
  const [favoritesOpen, setFavoritesOpen] = React.useState(true);
  const [foldersOpen, setFoldersOpen] = React.useState(true);

  return (
    <div className="clutter-sidepanel-scroll-sections">
      <SectionLayout
        bottomPadding={favoritesOpen}
        header={
          <Header
            label="Favorites"
            expanded={favoritesOpen}
            onToggle={() => setFavoritesOpen((open) => !open)}
          />
        }
      >
        {favoritesOpen ? (
          <SectionGroupLayout>
            <EmptyState
              type="inline"
              description="Star notes or folders to see them here"
            />
          </SectionGroupLayout>
        ) : null}
      </SectionLayout>
      <SectionLayout
        bottomPadding={foldersOpen}
        header={
          <Header
            label="Folders"
            expanded={foldersOpen}
            onToggle={() => setFoldersOpen((open) => !open)}
          />
        }
      >
        {foldersOpen ? (
          <SectionGroupLayout>
            <EmptyState type="inline" description="No Folders yet" />
          </SectionGroupLayout>
        ) : null}
      </SectionLayout>
    </div>
  );
}
