import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';

import './NewTaskContent.css';

export interface NewTaskContentProps {
  title: string;
  onTitleChange(value: string): void;
  onClose(): void;
}

/**
 * The New Task flow's content, rendered inside the shared `Dialog`
 * primitive by `TasksShortcuts` — owns only the title field's local draft
 * state and UI; it never calls TaskOperations or persists anything (see
 * tasksShortcuts.config.ts's own comment on why 'create-task' has no
 * backing capability yet).
 */
export function NewTaskContent({ title, onTitleChange, onClose }: NewTaskContentProps) {
  return (
    <div className="new-task">
      <div className="new-task__header">
        <span className="new-task__title">New task</span>
        <Button
          size="small"
          variant="ghost"
          interaction="subtle"
          isIconOnly
          aria-label="Close"
          onClick={onClose}
        >
          <AppIcon icon="dismiss" />
        </Button>
      </div>
      <Input
        className="new-task__input"
        value={title}
        placeholder="Task title"
        autoFocus
        hasBackground={false}
        hasBorder={false}
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <div className="new-task__footer">
        {/* No onClick yet — this is still the UI-only pass: no
            TaskOperations call, no Daily Note assignment, no persistence. */}
        <Button className="new-task__create-button" variant="primary" size="medium">
          Create
        </Button>
      </div>
    </div>
  );
}
