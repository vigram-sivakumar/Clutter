import type { PropertyValues } from '@core/properties/collectionProperties';
import type { TaskOccurrence } from '@core/vault/models/occurrences';

import { formatTaskTitle } from './formatTaskTitle';

/**
 * A task's raw collection-property values — the task domain's one adapter to the shared property
 * registry (the way a note's `values` are filled for the notes collection): its Name (the title as
 * shown, with the due-date mention hidden), its explicit Due date, and its Source (the note it lives in). A key is
 * absent when the task has no such value (no due date; no resolvable note), which the sort engine
 * orders last and the layouts draw as nothing. Raw values only — formatting is the layouts'.
 */
export function taskPropertyValues(task: TaskOccurrence, sourceLabel?: string): PropertyValues {
  return {
    name: formatTaskTitle(task.text, task.dueDate),
    ...(task.dueDate !== undefined && { dueDate: task.dueDate }),
    ...(sourceLabel !== undefined && { source: sourceLabel }),
  };
}
