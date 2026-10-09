import { Tab, Tabs } from '@components/tabs/Tabs';
import type { TaskViewKind } from '../helpers/tasksForView';

const TASK_TABS = [
  { value: 'all', label: 'All Tasks' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'unscheduled', label: 'Unscheduled' },
] as const;

export type TasksTabValue = (typeof TASK_TABS)[number]['value'];

/** A persisted tab value back to a valid tab — anything unrecognised (an old or hand-edited value) opens All Tasks. */
export function resolveTasksTab(stored: string | undefined): TasksTabValue {
  return TASK_TABS.find((tab) => tab.value === stored)?.value ?? TASK_TABS[0].value;
}

/** The dataset each tab shows — `tasksForView` decides its membership. */
export const TASKS_TAB_VIEW: Readonly<Record<TasksTabValue, TaskViewKind>> = {
  all: 'tasks-all',
  today: 'tasks-today',
  upcoming: 'tasks-upcoming',
  unscheduled: 'tasks-unscheduled',
};

interface TasksTabsProps {
  readonly value: TasksTabValue;
  readonly onValueChange: (value: TasksTabValue) => void;
}

/**
 * The tab strip below the Tasks page title (the title section's `tabs` slot). Controlled: the page owns the selected
 * tab and shows the matching dataset (`TASKS_TAB_VIEW`) in the list below.
 */
export function TasksTabs({ value, onValueChange }: TasksTabsProps) {
  return (
    <Tabs value={value} variant="ghost" onValueChange={(next) => onValueChange(next as TasksTabValue)}>
      {TASK_TABS.map((tab) => (
        <Tab key={tab.value} value={tab.value}>
          {tab.label}
        </Tab>
      ))}
    </Tabs>
  );
}
