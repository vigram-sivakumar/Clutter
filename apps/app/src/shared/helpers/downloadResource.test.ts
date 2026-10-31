import { describe, expect, it, vi, beforeEach } from 'vitest';

const isTauriMock = vi.fn();
const saveMock = vi.fn();

// The native Save panel (`export_pick_destination`) answers with a single-use ticket, or null when cancelled; the
// other two export commands receive that ticket and never a destination path.
const TICKET = 7;
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauriMock(),
  invoke: (command: string, args?: unknown, options?: unknown) =>
    command === 'export_pick_destination' ? saveMock(args) : invokeMock(command, args, options),
}));



describe('downloadResource', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    invokeMock.mockReset();
  });

  it('opens the native Save dialog defaulted to the resource filename', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(saveMock).toHaveBeenCalledWith({ defaultName: 'photo.png' });
  });

  it('cancelling the dialog (null) performs no write', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('confirming a destination copies the original bytes from the resource path to the chosen destination', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      'export_copy_file',
      { ticket: TICKET, from: '/vault/Assets/photo.png' },
      undefined
    );
  });

  it('is a no-op in the non-Tauri (browser) runtime — no dialog, no write', async () => {
    isTauriMock.mockReturnValue(false);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(saveMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
