import { useState, type ReactNode } from 'react';
import './Sidebar.css';
import { Tabs, Tab } from '@components/tabs/Tabs';
import { AppIcon } from '@shared/icon';
import type { Icon } from '@shared/icon';

import { Notes } from '@features/notes/sidebar/Sidebar.Notes';
import { DailyNotesPanel } from '@features/daily-notes/Sidebar.DailyNotes';
import { TasksPanel } from '@features/tasks/sidebar/Sidebar.Tasks';
import { TagsPanel } from '@features/tags/Sidebar.Tags';
import { SearchPanel } from '@features/search/Sidebar.Search';
import { Controls } from '@app/layouts/sidebar/controls/Controls';

const tabs: Array<{
  value: string;
  icon: Icon;
  panel: ReactNode;
}> = [
  {
    value: 'notes',
    icon: { type: 'system', name: 'note' },
    panel: <Notes />,
  },
  {
    value: 'daily-notes',
    icon: { type: 'system', name: 'calendarToday' },
    panel: <DailyNotesPanel />,
  },
  {
    value: 'tasks',
    icon: { type: 'system', name: 'squareCheckOutline' },
    panel: <TasksPanel />,
  },
  {
    value: 'tags',
    icon: { type: 'system', name: 'tag' },
    panel: <TagsPanel />,
  },
  {
    value: 'search',
    icon: { type: 'system', name: 'magnifyingGlass' },
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
            <AppIcon icon={tab.icon} />
          </Tab>
        ))}
      </Tabs>
      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === activeTab)?.panel}
      </div>
    </aside>
  );
}
