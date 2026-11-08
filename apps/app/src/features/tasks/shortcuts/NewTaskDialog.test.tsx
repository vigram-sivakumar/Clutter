// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NewTaskDialog } from './NewTaskDialog';

// Overlay's anchored positioning observes elements via ResizeObserver, which jsdom lacks (same stub TasksShortcuts.test uses).
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

type Save = (title: string, dueDate: string | undefined) => Promise<void>;

/** The dialog in Edit mode, open until it closes itself (like the page host's `editingTask` state). */
function EditHost({ onSaveTask, dueDate }: { onSaveTask: Save; dueDate?: string }) {
  const [open, setOpen] = useState(true);

  return open ? (
    <NewTaskDialog
      open
      onClose={() => setOpen(false)}
      editing={{ title: 'Collect the bill', dueDate }}
      onSaveTask={onSaveTask}
    />
  ) : null;
}

describe('NewTaskDialog — New task (unchanged)', () => {
  it('opens empty as "New task" with a Create action', () => {
    render(<NewTaskDialog open onClose={() => {}} onCreateTask={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByText('New task')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByText('Due date')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('Create calls onCreateTask with the typed title and no due date', async () => {
    const onCreateTask = vi.fn().mockResolvedValue(undefined);
    render(<NewTaskDialog open onClose={() => {}} onCreateTask={onCreateTask} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Buy milk' } });
    fireEvent.click(screen.getByText('Create').closest('button')!);

    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith('Buy milk', undefined));
  });
});

/** The dialog open until it closes itself, so a dismissal shows as the dialog going away. */
function NewHost() {
  const [open, setOpen] = useState(true);
  return open ? <NewTaskDialog open onClose={() => setOpen(false)} onCreateTask={vi.fn().mockResolvedValue(undefined)} /> : null;
}

const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' });
const clickBackdrop = () => fireEvent.click(document.querySelector('.overlay__backdrop')!);
const typeTitle = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });

describe('NewTaskDialog — dismissal', () => {
  it('an empty New task dismisses on Escape and on a click outside', () => {
    render(<NewHost />);
    pressEscape();
    expect(screen.queryByRole('textbox')).toBeNull();

    cleanup();
    render(<NewHost />);
    clickBackdrop();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a typed title survives Escape and a click outside; only the × closes it', () => {
    render(<NewHost />);
    typeTitle('Buy milk');

    pressEscape();
    clickBackdrop();
    expect(screen.getByRole('textbox')).toHaveValue('Buy milk');

    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a change to the due date alone also protects the draft', () => {
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} dueDate="2026-10-12" />);
    pressEscape();
    expect(screen.queryByRole('textbox')).toBeNull();

    cleanup();
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} dueDate="2026-10-12" />);
    fireEvent.click(screen.getByText(/12 Oct|Oct 12|12\/10/));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    pressEscape();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('emptying the title again makes it dismissible again', () => {
    render(<NewHost />);
    typeTitle('Buy milk');
    typeTitle('   ');

    pressEscape();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('closing and reopening starts unprotected: a fresh empty dialog dismisses', () => {
    const { rerender } = render(<NewTaskDialog open onClose={() => {}} onCreateTask={vi.fn()} />);
    typeTitle('Buy milk');
    rerender(<NewTaskDialog open={false} onClose={() => {}} onCreateTask={vi.fn()} />);
    rerender(<NewHost />);

    pressEscape();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('an untouched Edit task dismisses freely; a changed one is protected', () => {
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} />);
    pressEscape();
    expect(screen.queryByRole('textbox')).toBeNull();

    cleanup();
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} />);
    typeTitle('Collect the bill and the receipt');
    pressEscape();
    clickBackdrop();
    expect(screen.getByRole('textbox')).toHaveValue('Collect the bill and the receipt');
  });
});

describe('NewTaskDialog — Edit task', () => {
  it('opens prepopulated with the task, titled "Edit task" with a "Save changes" action', () => {
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} dueDate="2026-10-12" />);

    expect(screen.getByText('Edit task')).toBeInTheDocument();
    expect(screen.queryByText('New task')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('Collect the bill');
    expect(screen.getByText('12 Oct')).toBeInTheDocument();
    expect(screen.getByText('Save changes')).toBeInTheDocument();
    expect(screen.queryByText('Create')).toBeNull();
  });

  it('a task with no due date shows the empty Due date field', () => {
    render(<EditHost onSaveTask={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByText('Due date')).toBeInTheDocument();
  });

  it('Save changes saves the edited title through onSaveTask — the due date it was opened with is passed back unchanged — then closes', async () => {
    const onSaveTask = vi.fn<Save>().mockResolvedValue(undefined);
    render(<EditHost onSaveTask={onSaveTask} dueDate="2026-10-12" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Collect the parcel  ' } });
    fireEvent.click(screen.getByText('Save changes').closest('button')!);

    await waitFor(() => expect(onSaveTask).toHaveBeenCalledTimes(1));
    expect(onSaveTask).toHaveBeenCalledWith('Collect the parcel', '2026-10-12');
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('cannot save an empty title', () => {
    const onSaveTask = vi.fn<Save>().mockResolvedValue(undefined);
    render(<EditHost onSaveTask={onSaveTask} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    // The button stays enabled: pressing it shakes the title field instead.
    expect(screen.getByText('Save changes').closest('button')).toBeEnabled();
    fireEvent.click(screen.getByText('Save changes'));
    expect(screen.getByRole('textbox')).toHaveClass('editable-text--shake');
    expect(onSaveTask).not.toHaveBeenCalled();
  });

  it('Cancel (close) leaves the task unchanged: nothing is saved', async () => {
    const onSaveTask = vi.fn<Save>().mockResolvedValue(undefined);
    render(<EditHost onSaveTask={onSaveTask} dueDate="2026-10-12" />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something else' } });
    fireEvent.click(screen.getByLabelText('Close'));

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(onSaveTask).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows the error when saving fails', async () => {
    const onSaveTask = vi.fn<Save>().mockRejectedValue(new Error('The note is archived'));
    render(<EditHost onSaveTask={onSaveTask} />);

    fireEvent.click(screen.getByText('Save changes').closest('button')!);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The note is archived'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('a failure with no message reads "Failed to save task"', async () => {
    const onSaveTask = vi.fn<Save>().mockRejectedValue('boom');
    render(<EditHost onSaveTask={onSaveTask} />);

    fireEvent.click(screen.getByText('Save changes').closest('button')!);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to save task'));
  });
});
