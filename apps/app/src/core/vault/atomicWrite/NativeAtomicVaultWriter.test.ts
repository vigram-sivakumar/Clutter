// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { AtomicWriteProtocolError, AtomicWriteRefusedError, writeIntent } from './AtomicWriteContract';
import { ATOMIC_COMMANDS, NativeAtomicVaultWriter, parseDurabilityResult, parseInspectionResult, parseWriteOutcome } from './NativeAtomicVaultWriter';

const ROOT = '/vault';
const writer = (invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>) =>
  new NativeAtomicVaultWriter(invoke, ROOT);

/**
 * The JSON below is the exact wire format `src-tauri/src/atomic_commands.rs` produces. The same documents are
 * asserted on the Rust side (`wire_format_*` tests), so the two languages are held to one text.
 */
export const WIRE = {
  committedConfirmed: { status: 'committed', replaced: 'existing', durability: { status: 'confirmed' }, confirmedByInspection: false, metadataNotes: [], leftovers: [] },
  committedUnconfirmed: {
    status: 'committed', replaced: 'created',
    durability: { status: 'unconfirmed', gaps: [{ status: 'fileFsyncOnly' }, { status: 'directoryFsyncOnly' }, { status: 'directorySyncFailed', detail: 'EIO' }, { status: 'fileSyncFailed', detail: 'EIO' }] },
    confirmedByInspection: true, metadataNotes: ['birthTimeSubsecondPrecisionLost'], leftovers: ['/vault/.clutter-tmp.x'],
  },
  notCommitted: { status: 'notCommitted', reason: 'destinationExists', detail: 'exists', leftovers: [] },
  uncertain: { status: 'uncertain', detail: 'unknown', recoveryPaths: ['/vault/.clutter-tmp.y'] },
} as const;

describe('NativeAtomicVaultWriter: requests', () => {
  it('sends the intent explicitly, with the vault root, to the registered command names', async () => {
    const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => WIRE.committedConfirmed as unknown);
    const native = writer(invoke);

    await native.write({ path: '/vault/a.md', contents: 'x', intent: writeIntent.create });
    await native.write({ path: '/vault/a.md', contents: 'x', intent: writeIntent.replace });
    await native.write({ path: '/vault/a.md', contents: 'x', intent: writeIntent.replaceIfContent('old') });
    await native.write({ path: '/vault/a.md', contents: 'x', intent: writeIntent.upsert });

    expect(invoke.mock.calls.map(([command]) => command)).toEqual(Array(4).fill('atomic_write_file'));
    expect(invoke.mock.calls.map(([, args]) => (args as { request: { intent: unknown } }).request.intent)).toEqual([
      { kind: 'create' },
      { kind: 'replace' },
      { kind: 'replaceIfContent', expected: 'old' },
      { kind: 'upsert' },
    ]);
    expect(invoke.mock.calls[0]![1]).toEqual({ request: { vaultRoot: ROOT, path: '/vault/a.md', contents: 'x', intent: { kind: 'create' } } });
  });

  it('never sends a filesystem list or anything that could widen the native policy', async () => {
    const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => WIRE.committedConfirmed as unknown);
    await writer(invoke).write({ path: '/vault/a.md', contents: 'x', intent: writeIntent.create });

    expect(JSON.stringify(invoke.mock.calls[0]![1])).not.toMatch(/supportedFilesystems|filesystem/i);
  });

  it('sends inspection and durability requests to their own commands', async () => {
    const invoke = vi.fn(async (command: string, _args: Record<string, unknown>) =>
      command === ATOMIC_COMMANDS.inspect ? { status: 'inspected', target: 'holdsPrevious', temps: [] } : { status: 'confirmed' }
    );
    const native = writer(invoke);

    await native.inspect({ path: '/vault/a.md', attempted: 'new', previous: 'old', tempPaths: ['/vault/.clutter-tmp.y'] });
    await native.confirmDurability('/vault/a.md', 'new');

    expect(invoke).toHaveBeenNthCalledWith(1, 'atomic_inspect_write', { request: { vaultRoot: ROOT, path: '/vault/a.md', attempted: 'new', previous: 'old', tempPaths: ['/vault/.clutter-tmp.y'] } });
    expect(invoke).toHaveBeenNthCalledWith(2, 'atomic_confirm_durability', { request: { vaultRoot: ROOT, path: '/vault/a.md', expected: 'new' } });
  });

  it('is identified as the native writer, not as a simulation', () => {
    expect(writer(vi.fn()).kind).toBe('native-atomic');
  });
});

describe('NativeAtomicVaultWriter: results', () => {
  it('maps every write outcome, durability status and gap', () => {
    expect(parseWriteOutcome(WIRE.committedConfirmed)).toEqual({
      status: 'committed', replaced: 'existing', durability: { status: 'confirmed' }, confirmedByInspection: false, metadataNotes: [], leftovers: [],
    });
    expect(parseWriteOutcome(WIRE.committedUnconfirmed)).toEqual({
      status: 'committed', replaced: 'created',
      durability: { status: 'unconfirmed', gaps: [{ kind: 'fileFsyncOnly' }, { kind: 'directoryFsyncOnly' }, { kind: 'directorySyncFailed', detail: 'EIO' }, { kind: 'fileSyncFailed', detail: 'EIO' }] },
      confirmedByInspection: true, metadataNotes: ['birthTimeSubsecondPrecisionLost'], leftovers: ['/vault/.clutter-tmp.x'],
    });
    expect(parseWriteOutcome(WIRE.notCommitted)).toEqual({ status: 'notCommitted', reason: 'destinationExists', detail: 'exists', leftovers: [] });
    expect(parseWriteOutcome(WIRE.uncertain)).toEqual({ status: 'uncertain', detail: 'unknown', recoveryPaths: ['/vault/.clutter-tmp.y'] });
  });

  it('maps durability-confirmation results', () => {
    expect(parseDurabilityResult({ status: 'confirmed' })).toEqual({ status: 'confirmed' });
    expect(parseDurabilityResult({ status: 'unconfirmed', gaps: [{ status: 'directorySyncFailed', detail: 'EIO' }] })).toEqual({ status: 'unconfirmed', gaps: [{ kind: 'directorySyncFailed', detail: 'EIO' }] });
    expect(parseDurabilityResult({ status: 'superseded' })).toEqual({ status: 'superseded' });
    expect(parseDurabilityResult({ status: 'missing' })).toEqual({ status: 'missing' });
    expect(parseDurabilityResult({ status: 'refused', reason: 'outOfScope', detail: 'd' })).toEqual({ status: 'refused', reason: 'outOfScope', detail: 'd' });
    expect(parseDurabilityResult({ status: 'failed', detail: 'd' })).toEqual({ status: 'failed', detail: 'd' });
  });

  it('maps inspection results, including each temporary-file state', () => {
    const result = parseInspectionResult({
      status: 'inspected', target: 'holdsOther',
      temps: [{ path: '/a', state: 'absent' }, { path: '/b', state: 'holdsAttempted' }, { path: '/c', state: 'holdsOther' }, { path: '/d', state: 'unreadable', detail: 'EIO' }],
    });
    expect(result).toEqual({
      status: 'inspected', target: 'holdsOther',
      temps: [{ path: '/a', state: 'absent' }, { path: '/b', state: 'holdsAttempted' }, { path: '/c', state: 'holdsOther' }, { path: '/d', state: 'unreadable', detail: 'EIO' }],
    });
    for (const target of ['holdsAttempted', 'holdsPrevious', 'missing', 'holdsOther']) {
      expect(parseInspectionResult({ status: 'inspected', target, temps: [] })).toMatchObject({ target });
    }
    expect(parseInspectionResult({ status: 'refused', reason: 'unsupportedSymlink', detail: 'd' })).toEqual({ status: 'refused', reason: 'unsupportedSymlink', detail: 'd' });
    expect(parseInspectionResult({ status: 'failed', detail: 'd' })).toEqual({ status: 'failed', detail: 'd' });
  });

  it('accepts every reason the native layer can report, and rejects one it cannot', () => {
    const reasons = ['readOnlyTarget', 'unsupportedSymlink', 'notARegularFile', 'invalidTarget', 'outOfScope', 'insufficientSpace', 'permissionDenied', 'unsupportedOperation', 'staleExpected', 'targetChanged', 'unsupportedFilesystem', 'metadataPreservationFailed', 'destinationExists', 'destinationAppeared', 'targetMissing', 'io'];
    for (const reason of reasons) {
      expect(parseWriteOutcome({ status: 'notCommitted', reason, detail: '', leftovers: [] })).toMatchObject({ reason });
    }
    expect(() => parseWriteOutcome({ status: 'notCommitted', reason: 'madeUp', detail: '', leftovers: [] })).toThrow(AtomicWriteProtocolError);
  });

  it('treats a response it does not recognise as a protocol error, never as a success', () => {
    for (const bad of [null, 'ok', 42, [], {}, { status: 'saved' }, { status: 'committed' }, { status: 'committed', replaced: 'maybe', durability: { status: 'confirmed' } }]) {
      expect(() => parseWriteOutcome(bad)).toThrow(AtomicWriteProtocolError);
    }
    expect(() => parseDurabilityResult({ status: 'durable' })).toThrow(AtomicWriteProtocolError);
    expect(() => parseInspectionResult({ status: 'inspected', target: 'unknown', temps: [] })).toThrow(AtomicWriteProtocolError);
  });
});

describe('NativeAtomicVaultWriter: refusals and failures', () => {
  it('turns a native refusal into a typed error, for every command', async () => {
    const refuse = (code: string) => vi.fn(async () => { throw { code, detail: `refused: ${code}` }; });

    for (const code of ['invalidVaultRoot', 'invalidPath', 'outOfScope'] as const) {
      const native = writer(refuse(code));
      await expect(native.write({ path: '/x', contents: '', intent: writeIntent.create })).rejects.toMatchObject({ name: 'AtomicWriteRefusedError', code });
      await expect(native.inspect({ path: '/x', attempted: '', previous: null, tempPaths: [] })).rejects.toBeInstanceOf(AtomicWriteRefusedError);
      await expect(native.confirmDurability('/x', '')).rejects.toBeInstanceOf(AtomicWriteRefusedError);
    }
  });

  it('rethrows anything else exactly as it was (a rejected invoke is not a refusal)', async () => {
    const boom = new Error('ipc closed');
    await expect(writer(vi.fn(async () => { throw boom; })).write({ path: '/x', contents: '', intent: writeIntent.upsert })).rejects.toBe(boom);
    await expect(writer(vi.fn(async () => { throw 'plain string'; })).confirmDurability('/x', '')).rejects.toBe('plain string');
    await expect(writer(vi.fn(async () => { throw { code: 'somethingElse', detail: 'd' }; })).write({ path: '/x', contents: '', intent: writeIntent.upsert })).rejects.not.toBeInstanceOf(AtomicWriteRefusedError);
  });
});
