import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { FakeIdGenerator } from '../vault/testing/FakeIdGenerator';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { VaultScanner } from '../vault/ingest/VaultScanner';
import { VaultBuilder } from '../vault/ingest/VaultBuilder';
import { MemoryRecoveryStorage } from '../recovery/RecoveryStorage';
import { fingerprint } from '../recovery/fingerprint';
import { RECOVERY_DEBOUNCE_MS, type RecoveryJournal } from '../recovery/RecoveryJournal';

const ROOT = '/vault';
const NOTE = (text: string) => `---\nid: page-a\n---\n${text}\n`;

/** One "run" of Clutter on a vault: the Application, its in-memory vault files, and the shared recovery location. */
async function startRun(storage: MemoryRecoveryStorage, files: Record<string, string>) {
  const fileSystem = new InMemoryVaultFileSystem(files);
  await fileSystem.createDirectory(ROOT);
  const scan = await new VaultScanner(fileSystem).scan(ROOT);
  const { vault } = new VaultBuilder(new FakeIdGenerator()).build(scan);
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  application.attachRecovery(storage, ROOT);
  const journal = Reflect.get(application, 'recoveryJournal') as RecoveryJournal;
  journal.start();
  return { application, fileSystem, journal, vault };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('crash recovery, end to end on a real Application', () => {
  it('offers unsaved work after a crash, restores it as an unsaved edit, and saves it through the normal path', async () => {
    const storage = new MemoryRecoveryStorage();
    const first = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('saved text') });
    await first.application.pageOperations.open('page-a');
    first.application.pageOperations.commitEdit('page-a', 'typed before the crash');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);
    // The process dies here: nothing was saved, nothing is closed, no flush runs.
    expect(storage.files.size).toBe(1);

    const second = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('saved text') });
    await second.application.recoveryOperations!.discover();
    const [candidate] = second.application.recoveryOperations!.candidates;

    expect(candidate).toMatchObject({ outcome: 'recoverable', changes: ['body'] });
    expect(await second.fileSystem.readFile(`${ROOT}/A.md`)).toBe(NOTE('saved text')); // nothing replaced at startup

    await second.application.recoveryOperations!.restore(candidate!.key);

    const session = second.application.pageOperations.recoverableState('page-a');
    expect(session?.body?.markdown).toBe('typed before the crash'); // an unsaved edit in the editor
    expect(await second.fileSystem.readFile(`${ROOT}/A.md`)).toBe(NOTE('saved text')); // still not written
    expect(second.application.recoveryOperations!.candidates).toEqual([]);
    expect(storage.files.size).toBe(2); // the original is KEPT until the vault save; this session's own record protects the edit

    await second.application.pageOperations.requestSave('page-a'); // the normal save lifecycle
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    expect(await second.fileSystem.readFile(`${ROOT}/A.md`)).toContain('typed before the crash');
    expect(storage.files.size).toBe(0); // confirmed saved: both records are gone
  });

  it('never overwrites a note that changed in the vault: the recovered text can only become a new note', async () => {
    const storage = new MemoryRecoveryStorage();
    const first = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('saved text') });
    await first.application.pageOperations.open('page-a');
    first.application.pageOperations.commitEdit('page-a', 'typed before the crash');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    const second = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('edited in another app') });
    await second.application.recoveryOperations!.discover();
    const [candidate] = second.application.recoveryOperations!.candidates;
    expect(candidate!.outcome).toBe('conflict');

    await second.application.recoveryOperations!.restore(candidate!.key);

    expect(await second.fileSystem.readFile(`${ROOT}/A.md`)).toBe(NOTE('edited in another app'));
    const recovered = [...second.vault.pages()].find((page) => page.name.includes('(recovered)'));
    expect(recovered?.source.markdown).toContain('typed before the crash');
    expect(storage.files.size).toBe(0);
  });

  it('keeps the record when the note is not in the vault that was opened', async () => {
    const storage = new MemoryRecoveryStorage();
    const first = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('saved text') });
    await first.application.pageOperations.open('page-a');
    first.application.pageOperations.commitEdit('page-a', 'typed before the crash');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    const second = await startRun(storage, {});
    await second.application.recoveryOperations!.discover();

    expect(second.application.recoveryOperations!.candidates[0]!.outcome).toBe('missing-note');
    expect(storage.files.size).toBe(1);
  });

  it('starts normally when the recovery data is malformed', async () => {
    const storage = new MemoryRecoveryStorage();
    storage.files.set(`root-${fingerprint(ROOT)}/garbage.12345678.json`, '\u0000not json');
    const run = await startRun(storage, { [`${ROOT}/A.md`]: NOTE('saved text') });

    await expect(run.application.recoveryOperations!.discover()).resolves.toBeUndefined();
    expect(run.application.recoveryOperations!.candidates).toEqual([]);
    expect(run.application.recoveryOperations!.unreadableCount).toBe(1);
    expect(storage.files.size).toBe(1);
  });
});
