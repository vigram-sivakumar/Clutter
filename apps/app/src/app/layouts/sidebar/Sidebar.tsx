import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useState, type ReactNode } from 'react';
import { DailyNotePath } from '@core/application/daily-notes/DailyNotePath';
import { getActiveDailyNoteDate } from '@features/daily-notes/helpers/getActiveDailyNoteDate';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotes } from '@features/daily-notes/sidebar/Sidebar.DailyNotes';
import { Tasks } from '@features/tasks/sidebar/Sidebar.Tasks';
import { Tags } from '@features/tags/sidebar/Sidebar.Tags';
import { SearchPanel } from '@features/search/SearchPanel';
import { Controls } from '@app/layouts/sidebar/controls/Controls';
import { Footer } from './footer/Footer';

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
    effectivePageState,
  } = application;
  const workspace = useWorkspace(application.workspace);
  const [activeTab, setActiveTab] = useState('daily-notes');
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
      icon: 'calendarToday',
      panel: (
        <DailyNotes
          vault={vault}
          query={query}
          workspace={workspace}
          activeDate={activeDailyNoteDate}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onStartToday={() =>
            pageOperations.openAtPath(
              DailyNotePath.absoluteFrom(vault.root, new Date()),
              { type: 'daily-note' }
            )
          }
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
      icon: 'squiggleLine',
      panel: (
        <Notes
          query={query}
          workspace={workspace}
          navigation={navigation}
          pageOperations={pageOperations}
          folderOperations={folderOperations}
          effectivePageState={effectivePageState}
          onOpen={(pageId) => pageOperations.open(pageId)}
          onOpenFolder={(folderId) => folderOperations.open(folderId)}
          onOpenDraft={(pageId) => workspace.openPage(pageId)}
        />
      ),
    },
    {
      value: 'tasks',
      icon: 'squareCheckOutline',
      panel: <Tasks vault={vault} navigation={navigation} />,
    },
    {
      value: 'tags',
      icon: 'tag',
      panel: <Tags vault={vault} navigation={navigation} />,
    },
    {
      value: 'search',
      icon: 'magnifyingGlass',
      panel: <SearchPanel />,
    },
  ];

  return (
    <aside className="sidebar">
      <Controls />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {tabs.map((tab) => (
          <Tab key={tab.value} value={tab.value}>
            <AppIcon icon={tab.icon} emoji={tab.emoji} />
          </Tab>
        ))}
      </Tabs>
      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === activeTab)?.panel}
      </div>
      <Footer onOpenArchive={() => navigation.openArchive()} />
    </aside>
  );
}
