import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown, options?: unknown) => invokeMock(command, args, options),
}));

import { exportCopyFile, exportWriteBytes, pickExportDestination } from './nativeExport';

describe('nativeExport', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('asks the native side to open the Save panel, offering only a name', async () => {
    invokeMock.mockResolvedValue(3);

    expect(await pickExportDestination('photo.png')).toEqual({ ticket: 3 });
    expect(invokeMock).toHaveBeenCalledWith('export_pick_destination', { defaultName: 'photo.png' }, undefined);
  });

  it.each([[null], [undefined], ['/Users/me/Desktop/photo.png']])('treats %j from the panel as cancelled, never as a path to use', async (answer) => {
    invokeMock.mockResolvedValue(answer);

    expect(await pickExportDestination('photo.png')).toBeNull();
  });

  it('copies by ticket: the only path sent is the source, and no destination travels through script', async () => {
    invokeMock.mockResolvedValue(undefined);

    await exportCopyFile({ ticket: 3 }, '/vault/Assets/photo.png');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('export_copy_file', { ticket: 3, from: '/vault/Assets/photo.png' }, undefined);
  });

  it('writes bytes by ticket, in the raw request body, with the ticket in a header and no path at all', async () => {
    invokeMock.mockResolvedValue(undefined);
    const bytes = new Uint8Array([1, 2, 3]);

    await exportWriteBytes({ ticket: 3 }, bytes);

    expect(invokeMock).toHaveBeenCalledWith('export_write_file', bytes, { headers: { ticket: '3' } });
  });

  it('lets a refusal from the native side reach the caller', async () => {
    invokeMock.mockRejectedValue('that export destination was not chosen, or was already used');

    const outcome = await exportWriteBytes({ ticket: 9 }, new Uint8Array()).then(() => 'resolved', (error: unknown) => error);

    expect(outcome).toMatch(/not chosen/);
  });
});
