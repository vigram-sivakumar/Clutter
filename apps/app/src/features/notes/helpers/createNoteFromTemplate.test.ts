import { describe, expect, it, vi } from 'vitest';

import type { PageOperations } from '@core/application/page/PageOperations';

import { createNoteFromTemplate } from './createNoteFromTemplate';

function fakeOperations() {
  const openDraft = vi.fn().mockResolvedValue('draft-1');
  const mutateBody = vi.fn().mockResolvedValue(undefined);
  return { openDraft, mutateBody, operations: { openDraft, mutateBody } as unknown as PageOperations };
}

describe('createNoteFromTemplate', () => {
  it('opens a draft in the folder and puts the template body into it', async () => {
    const { openDraft, mutateBody, operations } = fakeOperations();

    await createNoteFromTemplate(operations, 'folder-1', '# Agenda');

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'folder-1' });
    expect(mutateBody).toHaveBeenCalledTimes(1);
    expect(mutateBody.mock.calls[0]![0]).toBe('draft-1');
    expect(mutateBody.mock.calls[0]![1]('ignored')).toBe('# Agenda');
  });

  it('leaves a blank template as the plain empty draft', async () => {
    const { openDraft, mutateBody, operations } = fakeOperations();

    await createNoteFromTemplate(operations, null, '  \n');

    expect(openDraft).toHaveBeenCalledWith({ folderId: null });
    expect(mutateBody).not.toHaveBeenCalled();
  });
});
