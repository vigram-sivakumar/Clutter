import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/** Install attempts allowed in total, the first install included (ADR-067). */
export const MAX_INSTALL_ATTEMPTS = 3;

export const WELCOME_INSTALL_KEY = 'welcomeInstall';

/**
 * ADR-067's per-Space ledger: the `welcomeInstall` key of the Space's own `.clutter/workspace.json`, the record a
 * resume needs to finish an interrupted first-run install without ever rewriting a file.
 *
 * - `completed`: entries `0..completed-1` of the manifest are finished, however they ended (written, or refused
 *   because something was already there). They are never looked at again, whether or not their file still exists.
 * - `inFlight`: entry `completed` was being written when the record was last updated. Resume never writes it.
 * - `plan`: a digest of every path and every bundled byte, so a later Clutter with different content never
 *   continues this install.
 * - `shown`: `false` while the Space has never been shown to the user (the first-run gate keeps it hidden until the
 *   install is complete and verified), `true` once it has. Absent means shown: a ledger from a build that opened the
 *   Space during its install is treated as exposed. It matters for exactly one thing: whether the file that was in
 *   flight at an interruption may be attempted again (see `WelcomeContentService`).
 */
export interface WelcomeInstallLedger {
  readonly version: 1;
  readonly plan: string;
  readonly total: number;
  readonly completed: number;
  readonly inFlight: boolean;
  readonly attempts: number;
  readonly state: 'installing' | 'complete';
  readonly outcome?: 'installed' | 'abandoned';
  readonly shown?: boolean;
}

function isLedger(value: unknown): value is WelcomeInstallLedger {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const wholeNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

  return (
    v.version === 1 &&
    typeof v.plan === 'string' &&
    wholeNumber(v.total) &&
    wholeNumber(v.completed) &&
    v.completed <= v.total &&
    typeof v.inFlight === 'boolean' &&
    wholeNumber(v.attempts) &&
    (v.state === 'installing' || v.state === 'complete') &&
    (v.outcome === undefined || v.outcome === 'installed' || v.outcome === 'abandoned') &&
    (v.shown === undefined || typeof v.shown === 'boolean')
  );
}

/**
 * The Space's ledger, or `null` when there is none or it cannot be read. A missing, corrupt or malformed record
 * means no resume: nothing runs. Never throws, never writes.
 */
export async function readWelcomeInstallLedger(
  fileSystem: VaultFileSystem,
  rootPath: string
): Promise<WelcomeInstallLedger | null> {
  try {
    const parsed: unknown = JSON.parse(await readWorkspaceStateFileText(fileSystem, rootPath));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const ledger = (parsed as Record<string, unknown>)[WELCOME_INSTALL_KEY];

    return isLedger(ledger) ? ledger : null;
  } catch {
    return null;
  }
}

/** Writes the ledger through the serialized merge writer. Rejects when the write fails: callers act on that. */
export function writeWelcomeInstallLedger(
  fileSystem: VaultFileSystem,
  rootPath: string,
  ledger: WelcomeInstallLedger
): Promise<void> {
  return mergeAndWriteWorkspaceStateFile(fileSystem, rootPath, { [WELCOME_INSTALL_KEY]: ledger });
}
