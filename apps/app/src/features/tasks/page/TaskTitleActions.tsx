import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Button } from '@components/button/Button';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';

interface TaskTitleActionsProps {
  /** The task's raw ISO `YYYY-MM-DD` due date, if it has one. */
  readonly dueDate: string | undefined;
  /** Opens the task in the Edit task modal. The Edit button is drawn only when this is given. */
  readonly onEdit?: () => void;
  /** A date string sets it, null clears it — never moves the task (the same contract as the row menu's Change due date). */
  readonly onChangeDueDate: (date: string | null) => void;
}

/**
 * The actions beside a task's title in the Task Collection: Edit (opens the New task dialog in edit mode) and
 * CalendarDots (opens the existing due-date picker, `TaskDatePicker`, to set or change the date — the same
 * `onChangeDueDate` → `TaskOperations.setDate`/`clearDate` path every other due-date control uses). Both are the
 * shared `Button`; clicking either never opens the row's note.
 */
export function TaskTitleActions({
  dueDate,
  onEdit,
  onChangeDueDate,
}: TaskTitleActionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  // How the picker was opened. Closing hands focus back to the button only for a keyboard open: handing it back after a
  // pointer open would leave the button focused, so the row's actions would stay revealed (`:focus-within`) after the
  // pointer left. Every dismissal path (Escape, outside click, choosing or clearing a date) closes through `closePicker`.
  // That only works if a pointer press never took focus in the first place — see `onMouseDown` on the wrapper below.
  const openedByKeyboardRef = useRef(false);
  // The actions are `display: none` unless revealed, and a `display: none` button can't take focus back. A keyboard open therefore keeps
  // them displayed (`data-keyboard-active`) from the open until focus leaves them, so closing the picker can return focus to its button.
  const [keyboardActive, setKeyboardActive] = useState(false);
  const suppressReturnFocusRef = useRef(false);
  const closePicker = () => {
    suppressReturnFocusRef.current = !openedByKeyboardRef.current;
    setPickerOpen(false);
  };
  const dateLabel = dueDate === undefined ? 'Set due date' : 'Change due date';

  return (
    <>
      <div
        className="collection-entry__actions"
        data-keyboard-active={keyboardActive ? '' : undefined}
        // A pointer press must not focus a button here (the browser's default on mousedown): the Overlay never moves focus
        // off the trigger, so a pointer-focused button would still hold focus after the picker closes and pin the actions
        // revealed through `:focus-within` once the pointer leaves. Keyboard focus (Tab, Enter) is unaffected.
        onMouseDown={(event) => event.preventDefault()}
        onBlur={(event) => {
          // Focus moving into the picker (still open) or between the two buttons keeps it; leaving them ends it.
          if (!pickerOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setKeyboardActive(false);
          }
        }}
      >
        {onEdit && (
          <Button
            size="small"
            variant="ghost"
            isIconOnly
            aria-label="Edit task"
            title="Edit task"
            onClick={(event) => {
              // The row opens its note on click; this button only opens the editor.
              event.stopPropagation();
              onEdit();
            }}
          >
            <AppIcon icon="edit" />
          </Button>
        )}
        <Button
          ref={dateButtonRef}
          size="small"
          variant="ghost"
          isIconOnly
          aria-label={dateLabel}
          title={dateLabel}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={(event) => {
            // The row opens its note on click; this button only opens the calendar.
            event.stopPropagation();
            // A keyboard activation (Enter/Space) dispatches a click with no pointer: `detail` is 0.
            openedByKeyboardRef.current = event.detail === 0;
            if (event.detail === 0) {
              setKeyboardActive(true);
            }
            setPickerOpen(true);
          }}
        >
          <AppIcon icon="calendarDots" />
        </Button>
      </div>
      <TaskDatePicker
        anchorRef={dateButtonRef}
        open={pickerOpen}
        onClose={closePicker}
        suppressReturnFocusRef={suppressReturnFocusRef}
        date={dueDate}
        onSelect={(selected) => {
          closePicker();
          onChangeDueDate(selected);
        }}
        onClear={() => {
          closePicker();
          onChangeDueDate(null);
        }}
      />
    </>
  );
}
