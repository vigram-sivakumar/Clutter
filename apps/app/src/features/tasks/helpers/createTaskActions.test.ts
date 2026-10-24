import { describe, expect, it, vi } from 'vitest';
import type { ToastApi } from '@components/toast/ToastProvider';
import { createTaskActions } from './createTaskActions';

const task = { sourcePageId: 'p1' } as never;

function setup() {
  const failures: Array<{ text: string; error?: unknown }> = [];
  const toast: ToastApi = {
    show: () => 1,
    fail: (text, error) => (failures.push({ text, error }), 1),
    dismiss: () => {},
  };
  const taskOperations = {
    toggleComplete: vi.fn(async () => {}),
    setDate: vi.fn(async () => {}),
    clearDate: vi.fn(async () => {}),
    duplicate: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  return { actions: createTaskActions(taskOperations as never, toast), taskOperations, failures, settle };
}

describe('createTaskActions', () => {
  it('runs each action through TaskOperations and stays silent on success', async () => {
    const { actions, taskOperations, failures, settle } = setup();

    actions.toggleComplete(task);
    actions.changeDueDate(task, '2026-10-24');
    actions.changeDueDate(task, null);
    actions.duplicate(task);
    actions.remove(task);
    await settle();

    expect(taskOperations.toggleComplete).toHaveBeenCalledWith(task);
    expect(taskOperations.setDate).toHaveBeenCalledWith(task, '2026-10-24');
    expect(taskOperations.clearDate).toHaveBeenCalledWith(task);
    expect(taskOperations.duplicate).toHaveBeenCalledWith(task);
    expect(taskOperations.delete).toHaveBeenCalledWith(task);
    expect(failures).toHaveLength(0);
  });

  it('reports each failure with an action-specific message and keeps the error', async () => {
    const { actions, taskOperations, failures, settle } = setup();
    const boom = new Error('boom');
    taskOperations.toggleComplete.mockRejectedValueOnce(boom);
    taskOperations.setDate.mockRejectedValueOnce(boom);
    taskOperations.duplicate.mockRejectedValueOnce(boom);
    taskOperations.delete.mockRejectedValueOnce(boom);

    actions.toggleComplete(task);
    actions.changeDueDate(task, '2026-10-24');
    actions.duplicate(task);
    actions.remove(task);
    await settle();

    expect(failures).toEqual([
      { text: 'Couldn’t update the task', error: boom },
      { text: 'Couldn’t change the due date', error: boom },
      { text: 'Couldn’t duplicate the task', error: boom },
      { text: 'Couldn’t delete the task', error: boom },
    ]);
  });
});
