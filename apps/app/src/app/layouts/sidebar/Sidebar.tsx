import type { Application } from '@core/application/Application';
import { useState, type ReactNode } from 'react';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotes } from '@features/daily-notes/Sidebar.DailyNotes';
import { Tasks } from '@features/tasks/sidebar/Sidebar.Tasks';
import { Tags } from '@features/tags/Sidebar.Tags';
import { SearchPanel } from '@features/search/Sidebar.Search';
import { Controls } from '@app/layouts/sidebar/controls/Controls';

interface SidebarProps {
  application: Application;
}

export function Sidebar({ application }: SidebarProps) {
  const { vault } = application;
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
      panel: <DailyNotes vault={vault} />,
    },
    {
      value: 'notes',
      icon: 'note',
      panel: <Notes application={application} />,
      emoji: '🍉',
    },
    {
      value: 'tasks',
      icon: 'squareCheckOutline',
      panel: <Tasks vault={vault} />,
    },
    {
      value: 'tags',
      icon: 'tag',
      panel: <Tags vault={vault} />,
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
    </aside>
  );
}
