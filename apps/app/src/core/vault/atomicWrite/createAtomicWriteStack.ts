import { invoke } from '@tauri-apps/api/core';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { AtomicWriteFileSystem } from './AtomicWriteFileSystem';
import { DurabilityTracker } from './DurabilityTracker';
import { NativeAtomicVaultWriter } from './NativeAtomicVaultWriter';

/**
 * The frontend asked for atomic writes but the native commands are not there (the app was built without the
 * `atomic-writes` Cargo feature). Saving must not quietly fall back to the truncating plugin write while Clutter
 * believes it is using the safe one, so opening the Space fails with this instead.
 */
export class AtomicWritesMisconfiguredError extends Error {
  readonly name = 'AtomicWritesMisconfiguredError';

  constructor(detail: string) {
    super(
      `Atomic saves are switched on in this build of the interface, but the native writer is not available (${detail}). ` +
        'Build the app with the atomic-writes feature, or switch atomic saves off.'
    );
  }
}

/**
 * Asks the native side whether the atomic commands exist, with a request that touches nothing. Any answer the
 * commands themselves give, including a refusal, proves they are registered; only the IPC layer saying the command
 * does not exist (or may not be called) is a misconfiguration.
 */
export async function assertAtomicCommandsRegistered(
  call: (command: string, args: Record<string, unknown>) => Promise<unknown>,
  vaultRoot: string
): Promise<void> {
  try {
    await call('atomic_inspect_write', {
      request: { vaultRoot, path: `${vaultRoot}/.clutter-probe`, attempted: '', previous: null, tempPaths: [] },
    });
  } catch (error) {
    if (typeof error === 'string' && /not found|not allowed/i.test(error)) {
      throw new AtomicWritesMisconfiguredError(error);
    }
    // A refusal from the command itself (no `.clutter` yet, out of scope): the command exists.
  }
}

export interface AtomicWriteStack {
  /** The provider every vault writer is to use: text writes replace the file whole. */
  readonly fileSystem: AtomicWriteFileSystem;
  readonly durability: DurabilityTracker;
}

/**
 * Builds the atomic write stack for one vault (ADR-063): the native writer, the tracker that follows revisions
 * installed with flush gaps, and the provider that exposes them as an ordinary `VaultFileSystem`. Called from the
 * Composition Root only, and only when atomic writes are enabled.
 *
 * `onDurabilityChange` runs when a path gains or loses a not-yet-durable revision, so crash recovery can look at that
 * note again.
 */
export function createAtomicWriteStack(options: {
  readonly inner: VaultFileSystem;
  readonly vaultRoot: string;
  readonly assertWritable?: () => void;
  readonly onDurabilityChange: (path: string) => void;
}): AtomicWriteStack {
  const writer = new NativeAtomicVaultWriter(invoke, options.vaultRoot);
  const durability = new DurabilityTracker(writer, { onChange: options.onDurabilityChange });

  return {
    fileSystem: new AtomicWriteFileSystem(options.inner, writer, durability, options.assertWritable, () =>
      assertAtomicCommandsRegistered(invoke, options.vaultRoot)
    ),
    durability,
  };
}
