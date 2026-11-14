import { describe, expect, it, vi } from 'vitest';
import {
  TaskTransferRecoveryStore,
  type TaskTransferRecord,
} from './TaskTransferRecoveryStore';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { mergeAndWriteWorkspaceStateFile } from '../initialize/workspaceStateFile';
import { VaultRootMissingError } from '../providers/VaultRootMissingError';

const record: TaskTransferRecord = {
  version: 1,
  id: 'fa780adf-0056-47b1-9a8e-e32d14e832bb',
  inboxPageId: 'inbox',
  before: '- [ ] Task @2026-11-20',
  after: '',
  destinations: [],
};
describe('private task transfer recovery', () => {
  it('stores recovery only in existing private Space metadata and preserves other owners', async () => {
    const fs = new InMemoryVaultFileSystem();
    const recovery = new TaskTransferRecoveryStore(fs, '/vault');
    expect(await recovery.load()).toBeNull();
    await mergeAndWriteWorkspaceStateFile(fs, '/vault', {
      unrelated: { keep: true },
    });
    await recovery.save(null, record);
    await mergeAndWriteWorkspaceStateFile(fs, '/vault', { other: 42 });
    expect(await recovery.load()).toEqual(record);
    await recovery.save(record, null);
    expect(
      JSON.parse(await fs.readFile('/vault/.clutter/workspace.json'))
    ).toEqual({
      unrelated: { keep: true },
      other: 42,
      taskInboxTransfer: null,
    });
    expect(await fs.exists('/vault/.clutter/inbox.md')).toBe(false);
  });

  it('rejects stale and competing record writes through the shared serialized queue', async () => {
    const fs = new InMemoryVaultFileSystem();
    const first = new TaskTransferRecoveryStore(fs, '/vault');
    const second = new TaskTransferRecoveryStore(fs, '/vault');
    const results = await Promise.allSettled([
      first.save(null, record),
      second.save(null, { ...record, id: 'other' }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(await first.load()).toEqual(record);
    await expect(second.save(null, null)).rejects.toThrow(
      'changed elsewhere'
    );
    expect(await first.load()).toEqual(record);
  });

  it('rejects corrupt recovery state without replacing it', async () => {
    const fs = new InMemoryVaultFileSystem({
      '/vault/.clutter/workspace.json': '{broken',
    });
    const recovery = new TaskTransferRecoveryStore(fs, '/vault');
    await expect(recovery.load()).rejects.toThrow();
    await expect(recovery.save(null, record)).rejects.toThrow(
      'changed elsewhere'
    );
    expect(await fs.readFile('/vault/.clutter/workspace.json')).toBe('{broken');
  });

  it('does not swallow the existing root-missing refusal for required recovery writes', async () => {
    const fs = new InMemoryVaultFileSystem();
    vi.spyOn(fs, 'writeFile').mockRejectedValue(
      new VaultRootMissingError('/vault')
    );
    const recovery = new TaskTransferRecoveryStore(fs, '/vault');
    await expect(recovery.save(null, record)).rejects.toBeInstanceOf(
      VaultRootMissingError
    );
  });
});
