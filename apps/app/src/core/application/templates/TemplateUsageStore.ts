import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * When each template was last successfully used (applied to a note, or a note made from it), persisted
 * through the `templateUsage` top-level key of `.clutter/workspace.json` — a sibling of the keys
 * `FoldStateStore`, `TagExpansionStore` and the other workspace stores own in that same file. Keyed by the
 * template page's immutable id, so a rename or move changes nothing. Not Gate-backed: this is Clutter's own
 * application metadata (ARCHITECTURE_RULES.md rule 2's `.clutter/*` scope), never document content.
 *
 * Only the time of the latest use is kept (`lastUsedAt`, `Date.now()` milliseconds) — no count, no history.
 * Its one consumer ranks the inline "Start with template" suggestions; a template with no record simply ranks
 * by its creation date. A record for a template that has since been deleted is inert: ranking only asks about
 * templates that still exist.
 *
 * `{ "templateUsage": { "<template page id>": { "lastUsedAt": 1791626400000 } } }`
 */
export class TemplateUsageStore {
  private readonly lastUsedAtById: Map<string, number>;

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    lastUsedAtById: Map<string, number>
  ) {
    this.lastUsedAtById = lastUsedAtById;
  }

  /** A non-persisting-until-written store with no usage; the default for tests and a missing file. */
  static empty(fileSystem: VaultFileSystem, rootPath: string): TemplateUsageStore {
    return new TemplateUsageStore(fileSystem, rootPath, new Map());
  }

  /**
   * Reads the persisted usage. Never throws: malformed JSON, a non-object file or `templateUsage` value is
   * logged and discarded, and a malformed individual record is dropped without affecting its neighbours —
   * the same boot-time posture as every other store of this file.
   */
  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<TemplateUsageStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `TemplateUsageStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no template usage.`
      );
      return TemplateUsageStore.empty(fileSystem, rootPath);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `TemplateUsageStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no template usage.`
      );
      return TemplateUsageStore.empty(fileSystem, rootPath);
    }

    const { templateUsage } = parsed as Record<string, unknown>;

    if (templateUsage === undefined) {
      return TemplateUsageStore.empty(fileSystem, rootPath);
    }

    if (typeof templateUsage !== 'object' || templateUsage === null || Array.isArray(templateUsage)) {
      console.warn(
        `TemplateUsageStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "templateUsage" is not an object — discarding it.`
      );
      return TemplateUsageStore.empty(fileSystem, rootPath);
    }

    const lastUsedAtById = new Map<string, number>();

    for (const [templateId, record] of Object.entries(templateUsage as Record<string, unknown>)) {
      const lastUsedAt = (record as { lastUsedAt?: unknown } | null)?.lastUsedAt;

      if (typeof lastUsedAt === 'number' && Number.isFinite(lastUsedAt)) {
        lastUsedAtById.set(templateId, lastUsedAt);
      } else {
        console.warn(
          `TemplateUsageStore: discarding malformed template usage record for "${templateId}".`
        );
      }
    }

    return new TemplateUsageStore(fileSystem, rootPath, lastUsedAtById);
  }

  /** When `templateId` was last used, or `undefined` if it never was (or the record was unreadable). */
  lastUsedAt(templateId: string): number | undefined {
    return this.lastUsedAtById.get(templateId);
  }

  /**
   * Records a successful use of `templateId` at `now`, replacing any earlier time, and persists. Call it
   * once, after the operation has succeeded. Fire-and-forget on the persist side, the accepted posture of
   * the other `.clutter/workspace.json` stores: the caller is a UI flow, not an `await`-able one.
   */
  recordUse(templateId: string, now: number = Date.now()): void {
    this.lastUsedAtById.set(templateId, now);
    void this.persist();
  }

  /**
   * Writes `templateUsage` via `mergeAndWriteWorkspaceStateFile`, which re-reads the file's other keys
   * immediately before writing so a sibling store's key is never clobbered (see that function's doc).
   */
  private async persist(): Promise<void> {
    const templateUsage: Record<string, { lastUsedAt: number }> = {};

    for (const [templateId, lastUsedAt] of this.lastUsedAtById) {
      templateUsage[templateId] = { lastUsedAt };
    }

    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, { templateUsage });
  }
}
