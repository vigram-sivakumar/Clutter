import { classifyDueDate } from './taskDueDate';

/** Exact due-date groups; stable within each date, chronological dates, Unscheduled last. */
export function groupByTaskDueDate<T>(items: readonly T[], dueDateOf: (item: T) => string | undefined) {
  const byDate = new Map<string, T[]>();
  for (const item of items) {
    const dueDate = dueDateOf(item);
    const date = classifyDueDate(dueDate) === 'unscheduled' ? '' : dueDate!;
    const group = byDate.get(date);
    if (group) group.push(item);
    else byDate.set(date, [item]);
  }
  return [...byDate.keys()]
    .sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))
    .map((date) => ({ date, items: byDate.get(date)! }));
}
