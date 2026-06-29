import { useState } from 'react';
import '../../styles/Sidebar.css';
import { Tabs } from '../tabs';
import { Tab } from '../tabs';
import { Icons } from '../../design-system/icons';

import { Notes } from '../sidepanels/Sidebar.Notes';
import { DailyNotesPanel } from '../sidepanels/Sidebar.DailyNotes';
import { TasksPanel } from '../sidepanels/Sidebar.Tasks';
import { TagsPanel } from '../sidepanels/Sidebar.Tags';
import { SearchPanel } from '../sidepanels/Sidebar.Search';

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
