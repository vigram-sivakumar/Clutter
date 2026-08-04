import type { TaskOccurrence as Task } from '@core/vault/models/occurrences';

export type TaskGroups = {
  today: readonly Task[];
  upcoming: readonly Task[];
};

export function groupTasks(tasks: readonly Task[]): TaskGroups {
  // TaskOccurrence has no due-date field yet (no extractor populates one —
  // see TaskExtractor.ts/PageAnalysisMapper.ts), so tasks can't actually be
  // split by date. Everything lands in `today` until that model gap is
  // closed; `upcoming` stays empty rather than guessing.
  // TODO: Split by real due date once the vault Task model exposes one.
  return {
    today: tasks,
    upcoming: [],
  };
}
