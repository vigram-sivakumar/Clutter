import { useState } from 'react';
import type { Vault } from '@core/vault/models';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { buildTasksShortcutHandler } from '@features/tasks/shortcuts/buildTasksShortcutHandler';
import { TasksShortcuts } from '@features/tasks/shortcuts/TasksShortcuts';
import { EditTaskDialog } from '@features/tasks/shortcuts/EditTaskDialog';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { createPageEmbedResolver } from '@app/layouts/page/resolvePageEmbed';
import { renderTasksByDate } from '../helpers/renderTasksByDate';
import type { TaskDisplayConfig } from '../helpers/groupTasks';

interface TasksPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly workspace: Workspace;
  readonly taskOperations: TaskOperations;
  readonly pageOperations: PageOperations;
  readonly folderOperations: FolderOperations;
  readonly effectivePageState: EffectivePageState;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference,
   * lifted to AppLayout (the common ancestor of this sidebar panel and the
   * Today/Everything else collection pages rendered by PageHost) and
   * persisted through `application.tasksViewConfigStore` — see AppLayout's
   * own wiring for why this can't just be local state here.
   */
  readonly tasksViewConfig: TaskDisplayConfig;
  readonly onTasksViewConfigChange: (next: TaskDisplayConfig) => void;
}

export function Tasks({
  vault,
  navigation,
  workspace,
  taskOperations,
  pageOperations,
  folderOperations,
  effectivePageState,
  tasksViewConfig,
  onTasksViewConfigChange,
}: TasksPanelProps) {
  const tasks = [...vault.tasks()];
  const onShortcut = buildTasksShortcutHandler(navigation);

  // Each section header's own settings-menu open state — local to this
  // panel (never persisted), and deliberately two independent booleans
  // rather than one "which section's menu is open" value, matching
  // TasksSectionSettingsMenu's own caller-owned `open` prop.
  const [todaySettingsMenuOpen, setTodaySettingsMenuOpen] = useState(false);
  const [upcomingSettingsMenuOpen, setUpcomingSettingsMenuOpen] = useState(false);

  // The task row's More Actions > Edit dialog — which task is being
  // edited, undefined when closed. Same local-UI-state convention as the
  // settings-menu booleans above; EditTaskDialog owns the actual Dialog +
  // NewTaskContent wiring (shared with PageHost.tsx's task-collection
  // pages — see that component's own doc comment).
  const [editingTask, setEditingTask] = useState<TaskOccurrence | undefined>(
    undefined
  );

  // Same composition PageHost.tsx/Sidebar.Notes.tsx/Sidebar.DailyNotes.tsx
  // use to inject the page editor's own WikiLink/Tag/embed resolution —
  // cheap, stateless glue, not worth memoizing
  // (resolveTag.ts/resolveWikiLink.ts/resolvePageEmbed.ts).
  const resolveWikiLink = createWikiLinkResolver(vault, pageOperations, folderOperations);
  const resolveTag = createTagResolver(navigation, vault);
  const resolveEmbed = createPageEmbedResolver(vault, effectivePageState);

  // Fire-and-forget, same as PageHost's onUpdateDescription/onArchive calls
  // into PageOperations — the UI reacts to the Vault's own notify() once
  // the Gate's rebuild lands (via AppLayout's single useVault() subscription),
  // never to this call's return value.
  const onToggleComplete = (task: TaskOccurrence): void => {
    void taskOperations.toggleComplete(task);
  };

  // Clicking a task opens its source note — the same PageOperations.open()
  // every other sidebar entry (FolderTree, DailyNotesList) already uses,
  // via the sourcePageId every TaskOccurrence already carries.
  const onOpenTask = (task: TaskOccurrence): void => {
    void pageOperations.open(task.sourcePageId);
  };

  // Opens the Edit Task modal (EditTaskDialog) for this row.
  const onEditTask = (task: TaskOccurrence): void => {
    setEditingTask(task);
  };

  // Opens the exact same Calendar (TaskDatePicker) a row's Change due
  // date menu item uses, via Task.tsx's own onChangeDueDate wiring — same
  // fire-and-forget shape as onToggleComplete, dispatching straight to
  // TaskOperations.setDate()/clearDate() (the one owning facade for
  // task-line mutation, per ADR-031), never touching Vault/PageOperations
  // itself, and never moving the task to a different page.
  const onChangeDueDate = (task: TaskOccurrence, date: string | null): void => {
    void (date === null ? taskOperations.clearDate(task) : taskOperations.setDate(task, date));
  };

  // Same fire-and-forget shape as onToggleComplete — dispatches straight
  // to TaskOperations (the one owning facade for task-line mutation, per
  // ADR-031), never touching Vault/PageOperations itself.
  const onDeleteTask = (task: TaskOccurrence): void => {
    void taskOperations.delete(task);
  };

  // New Task's target Daily Note: the selected due date's, or today's when
  // none was picked — the task's canonical location (its containing Daily
  // Note), per TaskBuilder's existing implicit-due-date fallback, which is
  // also why no inline @date is ever written by TaskOperations.create().
  // Same PageOperations.openAtPath(DailyNotePath.absoluteFrom(...))
  // resolve-or-draft call Sidebar.tsx's own DailyNotes "onOpenDate" and
  // resolveDate.ts already use — not a second Daily-Note-opening
  // mechanism. Awaited (not fire-and-forget, unlike onToggleComplete/
  // onDateChange above): NewTaskContent needs to know whether creation
  // succeeded before deciding to close itself. requestSave() forces the
  // promoted draft (or already-persisted page)'s new content to the
  // Durable stage immediately, rather than waiting on the body's ordinary
  // autosave debounce — the same explicit-flush call PageHost's onBlur
  // already makes — so the task is visible in the Daily Notes sidebar via
  // Vault's own notify() as soon as this resolves, no reload needed.
  const onCreateTask = async (title: string, dueDate: string | undefined): Promise<void> => {
    const targetDate = dueDate ?? toISODate(new Date());
    const path = DailyNotePath.absoluteFrom(vault.root, toDate(targetDate));
    const pageId = await pageOperations.openAtPath(path, { type: 'daily-note' });

    await taskOperations.create(pageId, title);
    await pageOperations.requestSave(pageId);
  };

  return (
    <View navigation={<TasksShortcuts onShortcut={onShortcut} onCreateTask={onCreateTask} />}>
      {renderTasksByDate({
        tasks,
        workspace,
        onToggleComplete,
        onOpenTask,
        onEditTask,
        onChangeDueDate,
        onDeleteTask,
        navigation,
        resolveWikiLink,
        resolveTag,
        resolveEmbed,
        displayConfig: tasksViewConfig,
        onDisplayConfigChange: onTasksViewConfigChange,
        todaySettingsMenu: {
          open: todaySettingsMenuOpen,
          onOpenChange: setTodaySettingsMenuOpen,
        },
        upcomingSettingsMenu: {
          open: upcomingSettingsMenuOpen,
          onOpenChange: setUpcomingSettingsMenuOpen,
        },
      })}
      <EditTaskDialog
        task={editingTask}
        onClose={() => setEditingTask(undefined)}
        taskOperations={taskOperations}
      />
    </View>
  );
}
