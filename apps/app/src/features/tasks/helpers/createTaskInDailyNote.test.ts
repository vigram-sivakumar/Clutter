import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Vault } from '@core/vault/models';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import { createTaskInDailyNote } from './createTaskInDailyNote';

const ROOT = '/vault';

describe('createTaskInDailyNote (ADR-044)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6)); // 2026-10-06
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const pageOperations = {
      ensureAtPath: vi.fn().mockResolvedValue('today-note'),
      openAtPath: vi.fn(),
      requestSave: vi.fn().mockResolvedValue(undefined),
    };
    const taskOperations = { create: vi.fn().mockResolvedValue(undefined) };
    const deps = {
      vault: { root: ROOT } as unknown as Vault,
      pageOperations: pageOperations as unknown as PageOperations,
      taskOperations: taskOperations as unknown as TaskOperations,
    };
    return { deps, pageOperations, taskOperations };
  }

  const todayPath = DailyNotePath.absoluteFrom(ROOT, new Date(2026, 9, 6));

  it.each([
    ['no date', undefined],
    ['due today', '2026-10-06'],
    ['due tomorrow', '2026-10-07'],
    ['due on a future date', '2026-10-08'],
  ])('stores a task with %s in today\'s Daily Note, carrying exactly the explicit date given', async (_name, dueDate) => {
    const { deps, pageOperations, taskOperations } = setup();

    await createTaskInDailyNote(deps, 'Submit report', dueDate);

    expect(pageOperations.ensureAtPath).toHaveBeenCalledTimes(1);
    expect(pageOperations.ensureAtPath).toHaveBeenCalledWith(todayPath, { type: 'daily-note' });
    expect(taskOperations.create).toHaveBeenCalledWith('today-note', 'Submit report', dueDate);
    expect(pageOperations.requestSave).toHaveBeenCalledWith('today-note');
  });

  it('never opens a Daily Note (and so never navigates), whatever the due date', async () => {
    const { deps, pageOperations } = setup();

    await createTaskInDailyNote(deps, 'Submit report', '2026-10-08');

    expect(pageOperations.openAtPath).not.toHaveBeenCalled();
  });
});
