import { describe, expect, it, vi } from 'vitest';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { AtomicWriteFileSystem } from './AtomicWriteFileSystem';
import {
  AtomicExternalChangeError,
  AtomicNotCommittedError,
  AtomicUncertainError,
  isRetryableSaveFailure,
} from './atomicWriteErrors';
import { DurabilityTracker } from './DurabilityTracker';
import type { InspectionResult } from './AtomicWriteContract';

const NOTE = '/v/note.md';

function setup(files: Record<string, string> = { [NOTE]: 'old' }) {
  const disk = new InMemoryVaultFileSystem(files);
  const writer = new InMemoryAtomicVaultWriter(disk);
  const tracker = new DurabilityTracker(writer, { delaysMs: [] });
  const fileSystem = new AtomicWriteFileSystem(disk, writer, tracker);

  return { disk, writer, tracker, fileSystem };
}

describe('AtomicWriteFileSystem: intents', () => {
  it('declares that its writes replace a file whole', () => {
    expect(setup().fileSystem.writesAreAtomic).toBe(true);
  });

  it('refuses a write that does not state its intent', async () => {
    const { fileSystem, disk } = setup();

    await expect(fileSystem.writeFile(NOTE, 'new')).rejects.toBeInstanceOf(TypeError);
    expect(await disk.readFile(NOTE)).toBe('old');
  });

  it('a create never replaces, a replace never creates, a conditional replace needs the expected text', async () => {
    const { fileSystem, disk } = setup();

    await expect(fileSystem.writeFile(NOTE, 'x', 'create')).rejects.toMatchObject({ reason: 'destinationExists' });
    await expect(fileSystem.writeFile('/v/gone.md', 'x', 'replace')).rejects.toMatchObject({ reason: 'targetMissing' });
    await expect(fileSystem.writeFile(NOTE, 'x', { replaceIf: 'something else' })).rejects.toMatchObject({ reason: 'staleExpected' });
    expect(await disk.readFile(NOTE)).toBe('old');
    expect(await disk.exists('/v/gone.md')).toBe(false);

    await fileSystem.writeFile(NOTE, 'new', { replaceIf: 'old' });
    await fileSystem.writeFile('/v/fresh.md', 'made', 'create');
    await fileSystem.writeFile('/v/state.json', '{}', 'upsert');
    expect(await disk.readFile(NOTE)).toBe('new');
    expect(await disk.readFile('/v/fresh.md')).toBe('made');
  });

  it('a retried create is still a create: it cannot replace what another writer made meanwhile', async () => {
    const { fileSystem, disk, writer } = setup({});
    writer.inject({ kind: 'not-committed', reason: 'io' });

    await expect(fileSystem.writeFile('/v/new.md', 'mine', 'create')).rejects.toBeInstanceOf(AtomicNotCommittedError);
    await disk.writeFile('/v/new.md', "someone else's");
    await expect(fileSystem.writeFile('/v/new.md', 'mine', 'create')).rejects.toMatchObject({ reason: 'destinationExists' });

    expect(await disk.readFile('/v/new.md')).toBe("someone else's");
  });
});

describe('AtomicWriteFileSystem: outcomes', () => {
  it('a not-committed write throws with its reason and leaves the original; only changeable reasons are retryable', async () => {
    const { fileSystem, disk, writer } = setup();

    writer.inject({ kind: 'not-committed', reason: 'insufficientSpace' });
    const space = await fileSystem.writeFile(NOTE, 'new', 'replace').catch((error) => error);
    writer.inject({ kind: 'not-committed', reason: 'readOnlyTarget' });
    const readOnly = await fileSystem.writeFile(NOTE, 'new', 'replace').catch((error) => error);

    expect(space).toBeInstanceOf(AtomicNotCommittedError);
    expect(isRetryableSaveFailure(space)).toBe(true);
    expect(isRetryableSaveFailure(readOnly)).toBe(false);
    expect(await disk.readFile(NOTE)).toBe('old');
  });

  it('a committed write with unconfirmed durability succeeds and is tracked, never thrown or retried', async () => {
    const { fileSystem, tracker, writer } = setup();
    writer.inject({ kind: 'durability-unconfirmed' });

    await expect(fileSystem.writeFile(NOTE, 'new', 'replace')).resolves.toBeUndefined();

    expect(tracker.hasPending(NOTE)).toBe(true);
    expect(writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1);
  });

  it('an uncertain write that took effect is committed (flush unconfirmed), not an error', async () => {
    const { fileSystem, tracker, writer, disk } = setup();
    writer.inject({ kind: 'uncertain', takesEffect: true });

    await expect(fileSystem.writeFile(NOTE, 'new', 'replace')).resolves.toBeUndefined();

    expect(await disk.readFile(NOTE)).toBe('new');
    expect(tracker.hasPending(NOTE)).toBe(true);
    expect(fileSystem.hasUncertainWrite(NOTE)).toBe(false);
  });

  it('an uncertain write that provably did not happen is a retryable not-committed failure', async () => {
    const { fileSystem, writer, disk } = setup();
    writer.inject({ kind: 'uncertain', takesEffect: false });

    const failure = await fileSystem.writeFile(NOTE, 'new', 'replace').catch((error) => error);

    expect(failure).toBeInstanceOf(AtomicNotCommittedError);
    expect(isRetryableSaveFailure(failure)).toBe(true);
    expect(await disk.readFile(NOTE)).toBe('old');
    expect(fileSystem.hasUncertainWrite(NOTE)).toBe(false);
  });
});

describe('AtomicWriteFileSystem: a write in doubt is inspected before any later write', () => {
  /** A writer whose inspection fails until told otherwise, standing in for "the state could not be proven". */
  function blindWriter() {
    const base = setup();
    let blind = true;
    const inspect = base.writer.inspect.bind(base.writer);
    vi.spyOn(base.writer, 'inspect').mockImplementation(async (query) =>
      blind ? ({ status: 'failed', detail: 'cannot look' } satisfies InspectionResult) : inspect(query)
    );

    return { ...base, see: () => (blind = false) };
  }

  it('stays uncertain while it cannot be inspected: the save fails as uncertain, is not retried, and the next write waits', async () => {
    const { fileSystem, writer, disk, see } = blindWriter();
    writer.inject({ kind: 'uncertain', takesEffect: false });

    const first = await fileSystem.writeFile(NOTE, 'N', 'replace').catch((error) => error);
    expect(first).toBeInstanceOf(AtomicUncertainError);
    expect(isRetryableSaveFailure(first)).toBe(false);
    expect(fileSystem.hasUncertainWrite(NOTE)).toBe(true);

    const second = await fileSystem.writeFile(NOTE, 'N+1', 'replace').catch((error) => error);
    expect(second).toBeInstanceOf(AtomicUncertainError);
    expect(await disk.readFile(NOTE)).toBe('old');
    expect(writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1);

    see();
    await fileSystem.writeFile(NOTE, 'N+1', 'replace');
    expect(await disk.readFile(NOTE)).toBe('N+1');
    expect(fileSystem.hasUncertainWrite(NOTE)).toBe(false);
  });

  it('after the doubt shows the attempted content was installed, the next write replaces it and the old revision is tracked', async () => {
    const { fileSystem, writer, disk, tracker, see } = blindWriter();
    writer.inject({ kind: 'uncertain', takesEffect: true });
    await fileSystem.writeFile(NOTE, 'N', 'replace').catch(() => undefined);
    see();

    await fileSystem.writeFile(NOTE, 'N+1', 'replace');

    expect(await disk.readFile(NOTE)).toBe('N+1');
    expect(tracker.hasPending(NOTE)).toBe(true);
  });

  it('if the file holds something else, nothing is overwritten and the failure says the file changed on disk', async () => {
    const { fileSystem, writer, disk, see } = blindWriter();
    writer.inject({ kind: 'uncertain', takesEffect: false });
    await fileSystem.writeFile(NOTE, 'N', 'replace').catch(() => undefined);
    // Something else replaced the file, and the writer's temporary file is gone: the rename may have happened.
    await disk.writeFile(NOTE, 'edited elsewhere');
    (writer as unknown as { temps: Map<string, string> }).temps.clear();
    see();

    const blocked = await fileSystem.writeFile(NOTE, 'N+1', 'replace').catch((error) => error);

    expect(blocked).toBeInstanceOf(AtomicExternalChangeError);
    expect(isRetryableSaveFailure(blocked)).toBe(false);
    expect(await disk.readFile(NOTE)).toBe('edited elsewhere');
    // Reported once; the next explicit save is not blocked forever.
    expect(fileSystem.hasUncertainWrite(NOTE)).toBe(false);
  });

  it('a replace never re-creates a file that vanished while the earlier write was in doubt', async () => {
    const { fileSystem, writer, disk, see } = blindWriter();
    writer.inject({ kind: 'uncertain', takesEffect: false });
    await fileSystem.writeFile(NOTE, 'N', 'replace').catch(() => undefined);
    await disk.deleteFile(NOTE);
    see();

    await expect(fileSystem.writeFile(NOTE, 'N+1', 'replace')).rejects.toMatchObject({ reason: 'targetMissing' });
    expect(await disk.exists(NOTE)).toBe(false);
  });

  it('writes to different paths are independent of one path being in doubt', async () => {
    const { fileSystem, writer, disk } = blindWriter();
    writer.inject({ kind: 'uncertain', takesEffect: false });
    await fileSystem.writeFile(NOTE, 'N', 'replace').catch(() => undefined);

    await fileSystem.writeFile('/v/other.md', 'fine', 'upsert');

    expect(await disk.readFile('/v/other.md')).toBe('fine');
  });
});

describe('AtomicWriteFileSystem: reads and moves are the inner provider’s', () => {
  it('delegates reads, moves and deletes unchanged', async () => {
    const { fileSystem, disk } = setup({ '/v/a.md': 'a' });

    expect(await fileSystem.readFile('/v/a.md')).toBe('a');
    await fileSystem.moveFile('/v/a.md', '/v/b.md');
    expect(await disk.exists('/v/b.md')).toBe(true);
    await fileSystem.deleteFile('/v/b.md');
    expect(await fileSystem.exists('/v/b.md')).toBe(false);
  });
});
