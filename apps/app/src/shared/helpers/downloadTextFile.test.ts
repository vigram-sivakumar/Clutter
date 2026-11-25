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



describe('downloadTextFile', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    invokeMock.mockReset();
  });

  it('opens the native Save dialog defaulted to the given filename', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadTextFile } = await import('./downloadTextFile');

    await downloadTextFile(() => 'const a = 1;', 'code.js');

    expect(saveMock).toHaveBeenCalledWith({ defaultName: 'code.js' });
  });

  it('does not call getContent before the dialog resolves', async () => {
    isTauriMock.mockReturnValue(true);
    let resolveSave!: (value: number | null) => void;
    saveMock.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));
    const getContent = vi.fn(() => 'const a = 1;');
    const { downloadTextFile } = await import('./downloadTextFile');

    const pending = downloadTextFile(getContent, 'code.js');
    expect(getContent).not.toHaveBeenCalled();

    resolveSave(TICKET);
    await pending;

    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it('cancelling the dialog (null) never calls getContent or writes', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const getContent = vi.fn(() => 'const a = 1;');
    const { downloadTextFile } = await import('./downloadTextFile');

    await downloadTextFile(getContent, 'code.js');

    expect(getContent).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('confirming a destination writes the UTF-8-encoded content there', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const { downloadTextFile } = await import('./downloadTextFile');

    await downloadTextFile(() => 'const a = 1;', 'code.js');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      'export_write_file',
      new TextEncoder().encode('const a = 1;'),
      { headers: { ticket: String(TICKET) } }
    );
  });

  it('leaves the destination alone when the code is no longer available after Save', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const { downloadTextFile } = await import('./downloadTextFile');

    await expect(downloadTextFile(() => null, 'code.js')).rejects.toThrow(/code block is no longer available/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('exports an intentionally empty block', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const { downloadTextFile } = await import('./downloadTextFile');

    await downloadTextFile(() => '', 'code.js');

    expect(invokeMock).toHaveBeenCalledWith(
      'export_write_file',
      new Uint8Array(0),
      { headers: { ticket: String(TICKET) } }
    );
  });

  it('is a no-op in the non-Tauri (browser) runtime', async () => {
    isTauriMock.mockReturnValue(false);
    const getContent = vi.fn(() => 'const a = 1;');
    const { downloadTextFile } = await import('./downloadTextFile');

    await downloadTextFile(getContent, 'code.js');

    expect(saveMock).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled();
  });
});
