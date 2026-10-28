import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { writeIntent } from './AtomicWriteContract';

const setup = (files: Record<string, string> = {}) => {
  const fileSystem = new InMemoryVaultFileSystem(files);
  return { fileSystem, writer: new InMemoryAtomicVaultWriter(fileSystem) };
};

describe('InMemoryAtomicVaultWriter: the four intents', () => {
  it('create makes a new file and never replaces an existing one', async () => {
    const { fileSystem, writer } = setup({ '/v/exists.md': 'theirs' });

    const created = await writer.write({ path: '/v/new.md', contents: 'mine', intent: writeIntent.create });
    const refused = await writer.write({ path: '/v/exists.md', contents: 'mine', intent: writeIntent.create });

    expect(created).toMatchObject({ status: 'committed', replaced: 'created', durability: { status: 'confirmed' } });
    expect(refused).toMatchObject({ status: 'notCommitted', reason: 'destinationExists' });
    expect(await fileSystem.readFile('/v/exists.md')).toBe('theirs');
  });

  it('replace replaces an existing file and never creates a missing one', async () => {
    const { fileSystem, writer } = setup({ '/v/a.md': 'old' });

    expect(await writer.write({ path: '/v/a.md', contents: 'new', intent: writeIntent.replace })).toMatchObject({ status: 'committed', replaced: 'existing' });
    expect(await writer.write({ path: '/v/gone.md', contents: 'x', intent: writeIntent.replace })).toMatchObject({ status: 'notCommitted', reason: 'targetMissing' });
    expect(await fileSystem.exists('/v/gone.md')).toBe(false);
    expect(await fileSystem.readFile('/v/a.md')).toBe('new');
  });

  it('replaceIfContent replaces only while the file holds exactly the expected content', async () => {
    const { fileSystem, writer } = setup({ '/v/a.md': 'current' });

    expect(await writer.write({ path: '/v/a.md', contents: 'repair', intent: writeIntent.replaceIfContent('stale') })).toMatchObject({ status: 'notCommitted', reason: 'staleExpected' });
    expect(await fileSystem.readFile('/v/a.md')).toBe('current');
    expect(await writer.write({ path: '/v/gone.md', contents: 'x', intent: writeIntent.replaceIfContent('anything') })).toMatchObject({ reason: 'staleExpected' });
    expect(await writer.write({ path: '/v/a.md', contents: 'repair', intent: writeIntent.replaceIfContent('current') })).toMatchObject({ status: 'committed' });
    expect(await fileSystem.readFile('/v/a.md')).toBe('repair');
  });

  it('upsert creates or replaces', async () => {
    const { fileSystem, writer } = setup({ '/v/state.json': '{}' });

    expect(await writer.write({ path: '/v/state.json', contents: '{"a":1}', intent: writeIntent.upsert })).toMatchObject({ replaced: 'existing' });
    expect(await writer.write({ path: '/v/other.json', contents: '{}', intent: writeIntent.upsert })).toMatchObject({ replaced: 'created' });
    expect(await fileSystem.readFile('/v/state.json')).toBe('{"a":1}');
  });

  it('is identified as a simulation, so a test cannot mistake it for the native guarantees', () => {
    expect(setup().writer.kind).toBe('in-memory-simulation');
  });
});

describe('InMemoryAtomicVaultWriter: intent survives a retry', () => {
  it('a create that failed and is retried is still a create, and cannot replace a file made in between', async () => {
    const { fileSystem, writer } = setup();
    writer.inject({ kind: 'not-committed', reason: 'insufficientSpace' });
    const request = { path: '/v/note.md', contents: 'mine', intent: writeIntent.create };

    const first = await writer.write(request);
    await fileSystem.writeFile('/v/note.md', 'another process');
    const retry = await writer.write(request);

    expect(first).toMatchObject({ status: 'notCommitted', reason: 'insufficientSpace' });
    expect(retry).toMatchObject({ status: 'notCommitted', reason: 'destinationExists' });
    expect(await fileSystem.readFile('/v/note.md')).toBe('another process');
  });

  it('a replace that failed and is retried after the file was deleted does not resurrect it', async () => {
    const { fileSystem, writer } = setup({ '/v/note.md': 'old' });
    writer.inject({ kind: 'not-committed', reason: 'io' });
    const request = { path: '/v/note.md', contents: 'new', intent: writeIntent.replace };

    await writer.write(request);
    await fileSystem.deleteFile('/v/note.md');
    const retry = await writer.write(request);

    expect(retry).toMatchObject({ status: 'notCommitted', reason: 'targetMissing' });
    expect(await fileSystem.exists('/v/note.md')).toBe(false);
  });
});

describe('InMemoryAtomicVaultWriter: uncertain outcomes, inspection and durability', () => {
  it('an uncertain write that took effect is found by inspection as holding the attempted content', async () => {
    const { writer } = setup({ '/v/a.md': 'previous' });
    writer.inject({ kind: 'uncertain', takesEffect: true });

    const outcome = await writer.write({ path: '/v/a.md', contents: 'attempted', intent: writeIntent.replace });
    const inspection = await writer.inspect({ path: '/v/a.md', attempted: 'attempted', previous: 'previous', tempPaths: [] });

    expect(outcome.status).toBe('uncertain');
    expect(inspection).toMatchObject({ status: 'inspected', target: 'holdsAttempted' });
  });

  it('an uncertain write that did not take effect leaves the previous content and a temporary file that holds the attempt', async () => {
    const { writer } = setup({ '/v/a.md': 'previous' });
    writer.inject({ kind: 'uncertain', takesEffect: false });

    const outcome = await writer.write({ path: '/v/a.md', contents: 'attempted', intent: writeIntent.replace });
    if (outcome.status !== 'uncertain') throw new Error('expected uncertain');
    const inspection = await writer.inspect({ path: '/v/a.md', attempted: 'attempted', previous: 'previous', tempPaths: outcome.recoveryPaths });

    expect(inspection).toEqual({ status: 'inspected', target: 'holdsPrevious', temps: [{ path: outcome.recoveryPaths[0], state: 'holdsAttempted' }] });
  });

  it('inspection tells a third state and a missing file apart', async () => {
    const { fileSystem, writer } = setup({ '/v/a.md': 'someone else' });

    expect(await writer.inspect({ path: '/v/a.md', attempted: 'new', previous: 'old', tempPaths: [] })).toMatchObject({ target: 'holdsOther' });
    await fileSystem.deleteFile('/v/a.md');
    expect(await writer.inspect({ path: '/v/a.md', attempted: 'new', previous: 'old', tempPaths: [] })).toMatchObject({ target: 'missing' });
  });

  it('durability confirmation identifies the revision by its content: N is confirmed, N+1 supersedes it', async () => {
    const { fileSystem, writer } = setup({ '/v/a.md': 'revision N' });

    expect(await writer.confirmDurability('/v/a.md', 'revision N')).toEqual({ status: 'confirmed' });
    await fileSystem.writeFile('/v/a.md', 'revision N+1');
    expect(await writer.confirmDurability('/v/a.md', 'revision N')).toEqual({ status: 'superseded' });
    expect(await writer.confirmDurability('/v/gone.md', 'x')).toEqual({ status: 'missing' });
  });

  it('a committed-but-unconfirmed write and a failed confirmation are expressible, and confirmation never rewrites', async () => {
    const { fileSystem, writer } = setup({ '/v/a.md': 'old' });
    writer.inject({ kind: 'durability-unconfirmed' });

    const outcome = await writer.write({ path: '/v/a.md', contents: 'new', intent: writeIntent.replace });
    writer.injectDurabilityFailure();
    const first = await writer.confirmDurability('/v/a.md', 'new');
    const second = await writer.confirmDurability('/v/a.md', 'new');

    expect(outcome).toMatchObject({ status: 'committed', durability: { status: 'unconfirmed' } });
    expect(first).toMatchObject({ status: 'unconfirmed' });
    expect(second).toEqual({ status: 'confirmed' });
    expect(await fileSystem.readFile('/v/a.md')).toBe('new');
    expect(writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1);
  });
});
