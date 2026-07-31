import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useState, type ReactNode } from 'react';
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
import { TauriDragStrip } from '@components/tauri-drag-strip/TauriDragStrip';

interface SidebarProps {
  application: Application;
}

export function Sidebar({ application }: SidebarProps) {
  const { vault, navigation } = application;
  const workspace = useWorkspace(application.workspace);
  const [activeTab, setActiveTab] = useState('daily-notes');

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
          workspace={workspace}
          onOpen={(pageId) => navigation.openDailyNote(pageId)}
          onOpenFolder={(folderId) => navigation.openFolder(folderId)}
        />
      ),
    },
    {
      value: 'notes',
      icon: 'note',
      panel: (
        <Notes
          vault={vault}
          workspace={workspace}
          navigation={navigation}
          onOpen={(pageId) => navigation.openNote(pageId)}
          onOpenFolder={(folderId) => navigation.openFolder(folderId)}
        />
      ),
      emoji: '🍉',
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
      <TauriDragStrip />
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
