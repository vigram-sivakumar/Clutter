import type { VaultFileSystem } from '../providers/VaultFileSystem';
import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../initialize/workspaceStateFile';

export interface TaskTransferDestination {
  readonly date: string;
  readonly pageId: string;
  readonly before: string;
  readonly after: string;
  readonly state: 'prepared' | 'saved';
}
export interface TaskTransferRecord {
  readonly version: 1;
  readonly id: string;
  readonly inboxPageId: string;
  readonly before: string;
  readonly after: string;
  readonly destinations: readonly TaskTransferDestination[];
  readonly legacyId?: string;
}
const KEY = 'taskInboxTransfer';

/** Temporary transfer recovery only; Markdown remains the canonical task source. */
export class TaskTransferRecoveryStore {
  constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly root: string
  ) {}

  public async load(): Promise<TaskTransferRecord | null> {
    const state: unknown = JSON.parse(
      await readWorkspaceStateFileText(this.fileSystem, this.root)
    );
    if (!state || typeof state !== 'object' || Array.isArray(state))
      throw new Error('Couldn’t safely resume Tidy up; Inbox tasks were kept');
    const value = (state as Record<string, unknown>)[KEY] ?? null;
    if (value === null) return null;
    if (!isRecord(value))
      throw new Error(
        'Couldn’t safely resume Tidy up; Inbox tasks were kept'
      );
    return value;
  }

  public async save(
    expected: TaskTransferRecord | null,
    next: TaskTransferRecord | null
  ): Promise<void> {
    await mergeAndWriteWorkspaceStateFile(
      this.fileSystem,
      this.root,
      { [KEY]: next },
      { key: KEY, expected }
    );
    // The shared writer intentionally tolerates a vanished root for ordinary preferences.
    // Recovery cannot: no note mutation follows until the actual saved record is confirmed.
    if (JSON.stringify(await this.load()) !== JSON.stringify(next)) {
      throw new Error(
        'Couldn’t prepare Tidy up; Inbox tasks were kept'
      );
    }
  }
}
function isRecord(value: unknown): value is TaskTransferRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<TaskTransferRecord>;
  return (
    v.version === 1 &&
    typeof v.id === 'string' &&
    typeof v.inboxPageId === 'string' &&
    typeof v.before === 'string' &&
    typeof v.after === 'string' &&
    (v.legacyId === undefined || typeof v.legacyId === 'string') &&
    Array.isArray(v.destinations) &&
    v.destinations.every(
      (d: Partial<TaskTransferDestination>) =>
        d &&
        typeof d.date === 'string' &&
        typeof d.pageId === 'string' &&
        typeof d.before === 'string' &&
        typeof d.after === 'string' &&
        (d.state === 'prepared' || d.state === 'saved')
    )
  );
}
