import { invoke } from '@tauri-apps/api/core';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { AtomicWriteFileSystem } from './AtomicWriteFileSystem';
import { DurabilityTracker } from './DurabilityTracker';
import { NativeAtomicVaultWriter } from './NativeAtomicVaultWriter';

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
    fileSystem: new AtomicWriteFileSystem(options.inner, writer, durability, options.assertWritable),
    durability,
  };
}
