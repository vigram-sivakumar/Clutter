import { describe, expect, it, vi } from 'vitest';
import { AtomicWritesMisconfiguredError, assertAtomicCommandsRegistered, prepareVaultForAtomicWrites } from './createAtomicWriteStack';

describe('assertAtomicCommandsRegistered: never a silent fallback to the truncating writer', () => {
  it('fails loudly when the native command does not exist (frontend on, Rust feature off)', async () => {
    const call = async () => {
      throw 'Command atomic_inspect_write not found';
    };

    await expect(assertAtomicCommandsRegistered(call, '/vault')).rejects.toBeInstanceOf(AtomicWritesMisconfiguredError);
  });

  it('fails loudly when the command exists but this window may not call it', async () => {
    const call = async () => {
      throw 'Command atomic_inspect_write not allowed by ACL';
    };

    await expect(assertAtomicCommandsRegistered(call, '/vault')).rejects.toBeInstanceOf(AtomicWritesMisconfiguredError);
  });

  it.each([
    ['a refusal from the command itself (no .clutter yet)', { code: 'invalidVaultRoot', detail: 'no .clutter' }],
    ['an ordinary answer', undefined],
  ])('accepts %s as proof the command is registered', async (_name, outcome) => {
    const call = async () => {
      if (outcome) throw outcome;

      return { status: 'inspected', target: 'missing', temps: [] };
    };

    await expect(assertAtomicCommandsRegistered(call, '/vault')).resolves.toBeUndefined();
  });

  it('sends a request that can touch nothing: an inspection of a path that is not a note', async () => {
    const calls: [string, unknown][] = [];

    await assertAtomicCommandsRegistered(async (command, args) => {
      calls.push([command, args]);
    }, '/vault');

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('atomic_inspect_write');
  });
});

describe('prepareVaultForAtomicWrites', () => {
  it('checks the commands exist, then restores the Space’s runtime grant, before any write', async () => {
    const calls: string[] = [];

    await prepareVaultForAtomicWrites(async (command) => {
      calls.push(command);
      return true;
    }, '/vault');

    expect(calls).toEqual(['atomic_inspect_write', 'ensure_space_access']);
  });

  it('a misconfigured build never gets as far as the grant', async () => {
    const calls: string[] = [];

    await expect(
      prepareVaultForAtomicWrites(async (command) => {
        calls.push(command);
        throw 'Command atomic_inspect_write not found';
      }, '/vault')
    ).rejects.toBeInstanceOf(AtomicWritesMisconfiguredError);

    expect(calls).toEqual(['atomic_inspect_write']);
  });

  it('a grant that cannot be made does not stop the writes (they are then refused by the native scope check, visibly)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      prepareVaultForAtomicWrites(async (command) => {
        if (command === 'ensure_space_access') throw 'denied';
      }, '/vault')
    ).resolves.toBeUndefined();

    error.mockRestore();
  });
});
