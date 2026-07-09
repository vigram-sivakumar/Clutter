import { useState, type ReactNode } from 'react';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotesPanel } from '@features/daily-notes/Sidebar.DailyNotes';
import { TasksPanel } from '@features/tasks/sidebar/Sidebar.Tasks';
import { TagsPanel } from '@features/tags/Sidebar.Tags';
import { SearchPanel } from '@features/search/Sidebar.Search';
import { Controls } from '@app/layouts/sidebar/controls/Controls';

const tabs: Array<{
  value: string;
  icon: SystemIcon;
  emoji?: string;
  panel: ReactNode;
}> = [
  {
    value: 'notes',
    icon: 'note',
    panel: <Notes />,
    emoji: '🍉',
  },
  {
    value: 'daily-notes',
    icon: 'calendarToday',
    panel: <DailyNotesPanel />,
  },
  {
    value: 'tasks',
    icon: 'squareCheckOutline',
    panel: <TasksPanel />,
  },
  {
    value: 'tags',
    icon: 'tag',
    panel: <TagsPanel />,
  },
  {
    value: 'search',
    icon: 'magnifyingGlass',
    panel: <SearchPanel />,
  },
];

export function Sidebar() {
  const [activeTab, setActiveTab] = useState('notes');

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
