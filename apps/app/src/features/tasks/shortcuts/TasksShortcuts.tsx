import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Dialog } from '@components/dialog/Dialog';

import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';
import { NewTaskContent } from './NewTaskContent';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
}

export function TasksShortcuts({ onShortcut }: TasksShortcutsProps) {
  // UI-only for now: opens the shared Dialog (Clutter's modal primitive —
  // centered Overlay with its own opaque surface/backdrop/animation, see
  // Dialog.tsx) with NewTaskContent's typeable title field. Nothing here
  // calls TaskOperations or persists anything — see tasksShortcuts.config.ts's
  // own comment on why 'create-task' can't yet dispatch through
  // onShortcut/NavigationRouter.
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
      >
        <NewTaskContent title={draftTitle} onTitleChange={setDraftTitle} onClose={closeNewTask} />
      </Dialog>
    </Section>
  );
}
