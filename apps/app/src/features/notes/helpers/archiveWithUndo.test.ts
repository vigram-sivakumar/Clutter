import { describe, expect, it, vi } from 'vitest';
import type { ToastApi, ToastInput } from '@components/toast/ToastProvider';
import { archivedMessage, createArchiveActions } from './archiveWithUndo';

function setup() {
  const shown: ToastInput[] = [];
  const failures: Array<{ text: string; error?: unknown }> = [];
  const toast: ToastApi = {
    show: (input) => (shown.push(input), shown.length),
    fail: (text, error) => (failures.push({ text, error }), 1),
    dismiss: () => {},
  };
  const pageOperations = {
    archive: vi.fn(async (_id: string) => {}),
    restore: vi.fn(async (_id: string) => ({ status: 'restored', movedToInbox: false }) as const),
  };
  const folderOperations = {
    archive: vi.fn(async (_id: string) => {}),
    restore: vi.fn(async (_id: string) => {}),
  };
  const resourceOperations = {
    archiveResource: vi.fn(async (_id: string) => {}),
    restoreResource: vi.fn(async (_id: string) => {}),
  };
  const page = (name: string, type: 'note' | 'daily-note' = 'note') => ({
    type,
    name,
    metadata: { description: null },
    source: { markdown: '' },
  });
  const vault = {
    getPage: (id: string) =>
      ({
        p1: page('Meeting notes'),
        p2: page('Untitled'),
        p3: page('2026-10-23', 'daily-note'),
        p4: page('A'.repeat(60)),
        p5: page('   '),
      })[id],
    getFolder: (id: string) => (id === 'f1' ? { name: 'Work' } : undefined),
    getResource: (id: string) => (id === 'r1' ? { name: 'diagram.png' } : undefined),
  };
  const actions = createArchiveActions({
    vault: vault as never,
    pageOperations: pageOperations as never,
    folderOperations: folderOperations as never,
    resourceOperations: resourceOperations as never,
    toast,
  });

  /** Presses the Undo of the last toast shown and lets its restore settle. */
  const undo = async () => {
    shown.at(-1)?.action?.onAction();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  return { actions, shown, failures, pageOperations, folderOperations, resourceOperations, undo };
}

describe('createArchiveActions', () => {
  it('archives a note and offers Undo', async () => {
    const { actions, shown, pageOperations } = setup();

    await actions.archivePage('p1');

    expect(pageOperations.archive).toHaveBeenCalledWith('p1');
    expect(shown).toHaveLength(1);
    expect(shown[0]?.text).toBe('Meeting notes archived');
    expect(shown[0]?.action?.label).toBe('Undo');
  });

  it('names a folder and a file in their own messages', async () => {
    const { actions, shown } = setup();

    await actions.archiveFolder('f1');
    await actions.archiveResource('r1');

    expect(shown.map((toast) => toast.text)).toEqual(['Work archived', 'diagram.png archived']);
  });

  it('reports a failed archive as an error, offers no Undo, and does not reject', async () => {
    const { actions, shown, failures, pageOperations } = setup();
    const boom = new Error('boom');
    pageOperations.archive.mockRejectedValueOnce(boom);

    await expect(actions.archivePage('p1')).resolves.toBeUndefined();

    expect(shown).toHaveLength(0);
    expect(failures).toEqual([{ text: 'Couldn’t archive this note', error: boom }]);
  });

  it('Undo restores through the existing restore operation, silently on success', async () => {
    const { actions, shown, failures, undo, pageOperations, folderOperations, resourceOperations } = setup();

    await actions.archivePage('p1');
    await undo();
    await actions.archiveFolder('f1');
    await undo();
    await actions.archiveResource('r1');
    await undo();

    expect(pageOperations.restore).toHaveBeenCalledWith('p1');
    expect(folderOperations.restore).toHaveBeenCalledWith('f1');
    expect(resourceOperations.restoreResource).toHaveBeenCalledWith('r1');
    expect(failures).toHaveLength(0);
    expect(shown).toHaveLength(3);
  });

  it('does not claim success when a note restore needs a destination or hits a conflict', async () => {
    const { actions, failures, undo, pageOperations } = setup();

    await actions.archivePage('p1');
    pageOperations.restore.mockResolvedValueOnce({ status: 'needs-destination' } as never);
    await undo();

    await actions.archivePage('p2');
    pageOperations.restore.mockResolvedValueOnce({ status: 'conflict', existingPageId: 'x' } as never);
    await undo();

    expect(failures.map((failure) => failure.text)).toEqual([
      'Couldn’t undo. Restore this note from the Archive',
      'Couldn’t undo. Restore this note from the Archive',
    ]);
  });

  it('reports a failed folder or file Undo, such as a restore that needs a destination', async () => {
    const { actions, failures, undo, folderOperations, resourceOperations } = setup();
    const needsDestination = new Error('needs destination');
    folderOperations.restore.mockRejectedValueOnce(needsDestination);
    resourceOperations.restoreResource.mockRejectedValueOnce(needsDestination);

    await actions.archiveFolder('f1');
    await undo();
    await actions.archiveResource('r1');
    await undo();

    expect(failures).toEqual([
      { text: 'Couldn’t undo. Restore this folder from the Archive', error: needsDestination },
      { text: 'Couldn’t undo. Restore this file from the Archive', error: needsDestination },
    ]);
  });

  it('stays silent on success, but still reports a failure, for the note or folder that is open', async () => {
    const { actions, shown, failures, pageOperations, folderOperations } = setup();

    await actions.archivePage('p1', { offerUndo: false });
    await actions.archiveFolder('f1', { offerUndo: false });
    expect(shown).toHaveLength(0);
    expect(pageOperations.archive).toHaveBeenCalledWith('p1');
    expect(folderOperations.archive).toHaveBeenCalledWith('f1');

    pageOperations.archive.mockRejectedValueOnce(new Error('boom'));
    await actions.archivePage('p2', { offerUndo: false });
    expect(failures.map((failure) => failure.text)).toEqual(['Couldn’t archive this note']);
  });

  it('names the item as the app shows it, and falls back to the plain noun when there is no name to quote', async () => {
    const { actions, shown } = setup();

    await actions.archivePage('p2'); // an auto-generated name: the app shows a placeholder
    await actions.archivePage('p5'); // blank
    await actions.archivePage('p9'); // not in the vault
    await actions.archiveFolder('f9');
    await actions.archiveResource('r9');
    await actions.archivePage('p3'); // a daily note shows its date

    expect(shown.map((toast) => toast.text)).toEqual([
      'Note archived',
      'Note archived',
      'Note archived',
      'Folder archived',
      'File archived',
      expect.stringMatching(/^\S.+ archived$/),
    ]);
    expect(shown.map((toast) => toast.text).join('|')).not.toMatch(/undefined|“|”|"/);
  });

  it('cuts a very long name with an ellipsis', async () => {
    const { actions, shown } = setup();

    await actions.archivePage('p4');

    expect(shown[0]?.text).toBe(`${'A'.repeat(40)}… archived`);
  });
});

describe('archivedMessage', () => {
  it('prints the name as it is, with no quotes, and never prints a missing one', () => {
    expect(archivedMessage('note', 'Meeting notes')).toBe('Meeting notes archived');
    expect(archivedMessage('note', undefined)).toBe('Note archived');
    expect(archivedMessage('folder', null)).toBe('Folder archived');
    expect(archivedMessage('file', '')).toBe('File archived');
    expect(archivedMessage('file', '  diagram.png  ')).toBe('diagram.png archived');
  });
});
