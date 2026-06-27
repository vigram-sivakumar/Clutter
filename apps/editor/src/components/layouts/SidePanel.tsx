import { useState } from 'react';
import '../../styles/sidepanel.css';
import { Tabs, Tab } from '../tabs';
import { Icons } from '../../design-system/icons';

import { NotesPanel } from '../sidepanels/NotesPanel';
import { DailyNotesPanel } from '../sidepanels/DailyNotesPanel';
import { TasksPanel } from '../sidepanels/TasksPanel';
import { TagsPanel } from '../sidepanels/TagsPanel';
import { SearchPanel } from '../sidepanels/SearchPanel';

const tabs = [
  {
    value: 'notes',
    icon: <Icons.Note />,
    panel: <NotesPanel />,
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

export function SidePanel() {
  const [activeTab, setActiveTab] = useState('notes');

  return (
    <aside className="side-panel">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {tabs.map((tab) => (
          <Tab key={tab.value} value={tab.value}>
            {tab.icon}
          </Tab>
        ))}
      </Tabs>
      {tabs.find((tab) => tab.value === activeTab)?.panel}
    </aside>
  );
}
