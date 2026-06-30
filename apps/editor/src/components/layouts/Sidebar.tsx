import { useState } from 'react';
import '../../styles/Sidebar.css';
import { Tabs, Tab } from '../Tabs';
import { Icons } from '../../design-system/icons';

import { Notes } from '../sidebar/Sidebar.Notes';
import { DailyNotesPanel } from '../sidebar/Sidebar.DailyNotes';
import { TasksPanel } from '../sidebar/Sidebar.Tasks';
import { TagsPanel } from '../sidebar/Sidebar.Tags';
import { SearchPanel } from '../sidebar/Sidebar.Search';
import { Controls } from '../sidebar/Sidebar.Controls';

const tabs = [
  {
    value: 'notes',
    icon: <Icons.Note />,
    panel: <Notes />,
  },
  {
    value: 'daily-notes',
    icon: <Icons.CalendarBlank />,
    panel: <DailyNotesPanel />,
  },
  {
    value: 'tasks',
    icon: <Icons.SquareCheckOutline />,
    panel: <TasksPanel />,
  },
  {
    value: 'tags',
    icon: <Icons.Tag />,
    panel: <TagsPanel />,
  },
  {
    value: 'search',
    icon: <Icons.MagnifyingGlass />,
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
            {tab.icon}
          </Tab>
        ))}
      </Tabs>
      <div className="sidebar--content">
        {tabs.find((tab) => tab.value === activeTab)?.panel}
      </div>
    </aside>
  );
}
