import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Dialog } from '@components/dialog/Dialog';

import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';
import { NewTaskContent } from './NewTaskContent';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
  /**
   * Creates the task in its target Daily Note (due date's, or today's —
   * see Sidebar.Tasks.tsx's own onCreateTask) and resolves once it's
   * durable. Rejects on failure, which NewTaskContent uses to decide
   * whether to close itself — plain pass-through, no TaskOperations/
   * PageOperations import here (UI/Features must never import a concrete
   * application-layer class directly, ARCHITECTURE_RULES rule 6).
   */
  onCreateTask: (title: string, dueDate: string | undefined) => Promise<void>;
}

export function TasksShortcuts({ onShortcut, onCreateTask }: TasksShortcutsProps) {
  // Opens the shared Dialog (Clutter's modal primitive — centered Overlay
  // with its own opaque surface/backdrop/animation, see Dialog.tsx) with
  // NewTaskContent's title field + due-date picker. 'create-task' never
  // dispatches through onShortcut/NavigationRouter — see
  // tasksShortcuts.config.ts's own comment on why.
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const closeNewTask = () => {
    setIsNewTaskOpen(false);
    setDraftTitle('');
  };

  return (
    <Section>
      {tasksShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          onClick={() =>
            shortcut.id === 'create-task' ? setIsNewTaskOpen(true) : onShortcut(shortcut.id)
          }
        />
      ))}

      <Dialog
        open={isNewTaskOpen}
        onClose={closeNewTask}
        size="large"
        top={240}
        scrim="strong"
        dismissible={false}
      >
        <NewTaskContent
          title={draftTitle}
          onTitleChange={setDraftTitle}
          onClose={closeNewTask}
          onCreateTask={onCreateTask}
        />
      </Dialog>
    </Section>
  );
}
