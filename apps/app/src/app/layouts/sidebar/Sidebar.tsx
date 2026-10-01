import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import type { ReactNode } from 'react';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { TaskDisplayConfig } from '@features/tasks/helpers/groupTasks';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { getActiveDailyNoteDate } from '@features/daily-notes/helpers/getActiveDailyNoteDate';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotes } from '@features/daily-notes/sidebar/Sidebar.DailyNotes';
import { Tasks } from '@features/tasks/sidebar/Sidebar.Tasks';
import { Tags } from '@features/tags/sidebar/Sidebar.Tags';
import { SearchPanel } from '@features/search/SearchPanel';
import { Controls } from '@app/layouts/sidebar/controls/Controls';
import { Footer } from './footer/Footer';
import { testIds } from '@shared/testing/selectors';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';

interface SidebarProps {
  application: Application;
  /**
   * Opens the shared resource overlay (owned by `AppLayout`, the confirmed
   * common ancestor of `Sidebar` and `PageHost`) for a real `VaultResource`
   * — routes to `ImageOverlay` or `PdfOverlay` based on `resource.kind`.
   */
  readonly onOpenResource: (resource: VaultResource) => void;
  /** See AppLayout's own doc comment on its `tasksViewConfig` state — lifted here since Sidebar's Tasks panel is one of its two consumers. */
  readonly tasksViewConfig: TaskDisplayConfig;
  readonly onTasksViewConfigChange: (next: TaskDisplayConfig) => void;
  /** See AppLayout's own doc comment on its `pendingReveal` state — set here by Tasks' "Open in note" (and by PageHost's own Tag collection "Open note"), consumed by PageHost. */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
}

export function Sidebar({
  application,
  onOpenResource,
  tasksViewConfig,
  onTasksViewConfigChange,
  onRequestReveal,
}: SidebarProps) {
  const {
    vault,
    query,
    navigation,
    pageOperations,
    folderOperations,
    resourceOperations,
    taskOperations,
    effectivePageState,
    membershipSelector,
  } = application;
  const workspace = useWorkspace(application.workspace);
  const activeDailyNoteDate = getActiveDailyNoteDate(
    vault,
    workspace.activePageId,
    pageOperations
  );

  const tabs: Array<{
    value: string;
    icon: SystemIcon;
    emoji?: string;
    panel: ReactNode;
  }> = [
    {
      value: 'daily-notes',
      icon: getSystemLocationPresentation('daily-notes').icon,
      panel: (
        <DailyNotes
          vault={vault}
          query={query}
          membershipSelector={membershipSelector}
          workspace={workspace}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          activeDate={activeDailyNoteDate}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
          onOpenDate={(date) =>
            pageOperations.openAtPath(
              DailyNotePath.absoluteFrom(vault.root, new Date(date)),
              { type: 'daily-note' }
            )
          }
        />
      ),
    },
    {
      value: 'notes',
      icon: getSystemLocationPresentation('notes').icon,
      panel: (
        <Notes
          vault={vault}
          query={query}
          workspace={workspace}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          resourceOperations={resourceOperations}
          effectivePageState={effectivePageState}
          membershipSelector={membershipSelector}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
          onOpenResource={onOpenResource}
        />
      ),
    },
    {
      value: 'tasks',
      icon: getSystemLocationPresentation('tasks').icon,
      panel: (
        <Tasks
          vault={vault}
          navigation={navigation}
          workspace={workspace}
          taskOperations={taskOperations}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          tasksViewConfig={tasksViewConfig}
          onTasksViewConfigChange={onTasksViewConfigChange}
          onRequestReveal={onRequestReveal}
        />
      ),
    },
    {
      value: 'tags',
      icon: getSystemLocationPresentation('tags').icon,
      panel: (
        <Tags
          vault={vault}
          navigation={navigation}
          tagOperations={application.tagOperations}
          pageOperations={pageOperations}
          effectivePageState={effectivePageState}
          workspace={workspace}
          tagExpansionStore={application.tagExpansionStore}
          onRequestReveal={onRequestReveal}
        />
      ),
    },
    {
      value: 'search',
      icon: getSystemLocationPresentation('search').icon,
      panel: <SearchPanel />,
    },
  ];

  return (
    <aside className="sidebar" data-testid={testIds.sidebar.root}>
      {/* Sidebar content always stays mounted regardless of
          isSidebarVisible; nothing currently unmounts it based on that
          state. Controls no longer renders the sidebar-toggle button
          itself — see SidebarToggle (app-layout/sidebar-toggle). */}
      <Controls />
      <div className="sidebar--tabs">
        <Tabs
          value={workspace.activeSidebarTab}
          onValueChange={(tab) => workspace.setActiveSidebarTab(tab)}
        >
          {tabs.map((tab) => (
            <Tab key={tab.value} value={tab.value}>
              <AppIcon icon={tab.icon} emoji={tab.emoji} />
            </Tab>
          ))}
        </Tabs>
      </div>

      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === workspace.activeSidebarTab)?.panel}
      </div>
      <Footer onOpenArchive={() => navigation.openArchive()} />
    </aside>
  );
}
