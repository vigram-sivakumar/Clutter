import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import type { ReactNode } from 'react';
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

interface SidebarProps {
  application: Application;
}

export function Sidebar({ application }: SidebarProps) {
  const {
    vault,
    query,
    navigation,
    pageOperations,
    folderOperations,
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
          pageOperations={pageOperations}
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
          effectivePageState={effectivePageState}
          membershipSelector={membershipSelector}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
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
        />
      ),
    },
    {
      value: 'tags',
      icon: getSystemLocationPresentation('tags').icon,
      panel: <Tags vault={vault} navigation={navigation} tagOperations={application.tagOperations} />,
    },
    {
      value: 'search',
      icon: getSystemLocationPresentation('search').icon,
      panel: <SearchPanel />,
    },
  ];

  return (
    <aside className="sidebar" data-testid={testIds.sidebar.root}>
      {/* Sidebar content always stays mounted — AppLayout is the single
          place isSidebarVisible drives layout, via its CSS Grid collapse
          (data-sidebar-collapsed), not a React unmount here. Two different
          collapse techniques for the same state would defeat the point of
          having one source of truth (ADR-021, M4). */}
      <Controls
        isSidebarVisible={workspace.isSidebarVisible}
        onToggleSidebarVisible={() => workspace.toggleSidebarVisible()}
        canNavigateBack={workspace.canNavigateBack}
        canNavigateForward={workspace.canNavigateForward}
        onNavigateBack={() => navigation.back()}
        onNavigateForward={() => navigation.forward()}
      />
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
