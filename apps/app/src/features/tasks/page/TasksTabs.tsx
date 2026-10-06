import { useState } from 'react';
import { Tab, Tabs } from '@components/tabs/Tabs';
import '../sidebar/Task.css';

const TASK_TABS = [
  { value: 'all', label: 'All Tasks' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'unscheduled', label: 'Unscheduled' },
  { value: 'completed', label: 'Completed' },
] as const;

/**
 * The tab strip under the All Tasks title. Presentation only for now: it holds just its own selected
 * tab and is not connected to the list, filtering or any task data.
 */
export function TasksTabs() {
  const [value, setValue] = useState<string>(TASK_TABS[0].value);

  return (
    // The wrapper makes the strip hug its tabs instead of stretching across the page body.
    <div className="tasks-tabs">
      <Tabs value={value} onValueChange={setValue}>
        {TASK_TABS.map((tab) => (
          <Tab key={tab.value} value={tab.value}>
            {tab.label}
          </Tab>
        ))}
      </Tabs>
    </div>
  );
}
