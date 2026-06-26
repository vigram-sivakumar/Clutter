import { useState } from 'react';
import '../../styles/sidepanel.css';
import { Tabs, Tab } from '../tabs';
import { CustomIcons } from '../../design-system/icons';

import { NotesPanel } from '../sidepanels/NotesPanel';
import { DailyNotesPanel } from '../sidepanels/DailyNotesPanel';
import { TasksPanel } from '../sidepanels/TasksPanel';
import { TagsPanel } from '../sidepanels/TagsPanel';
import { SearchPanel } from '../sidepanels/SearchPanel';

const tabs = [
  {
    value: 'notes',
    icon: <CustomIcons.Note />,
    panel: <NotesPanel />,
  },
  {
    value: 'daily-notes',
    icon: <CustomIcons.CalendarBlank />,
    panel: <DailyNotesPanel />,
  },
  {
    value: 'tasks',
    icon: <CustomIcons.SquareCheckOutline />,
    panel: <TasksPanel />,
  },
  {
    value: 'tags',
    icon: <CustomIcons.Tag />,
    panel: <TagsPanel />,
  },
  {
    value: 'search',
    icon: <CustomIcons.MagnifyingGlass />,
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
