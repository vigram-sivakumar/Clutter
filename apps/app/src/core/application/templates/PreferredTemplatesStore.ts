import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { ChangeListener, Observable } from '../../shared/Observable';

/**
 * Where a preference applies: regular `notes`, or `dailyNotes`. Each has its own independent list. The Daily
 * notes list keeps the original `preferredTemplates` key, so a file written before Notes had preferences reads
 * back unchanged; the Notes list lives under `preferredNoteTemplates`. Methods that take a context default to
 * `dailyNotes`, the context the store was first written for.
 */
export type PreferredTemplatesContext = 'notes' | 'dailyNotes';

const STORAGE_KEYS: Record<PreferredTemplatesContext, string> = {
  dailyNotes: 'preferredTemplates',
  notes: 'preferredNoteTemplates',
};

const CONTEXTS = Object.keys(STORAGE_KEYS) as PreferredTemplatesContext[];

type IdsByContext = Record<PreferredTemplatesContext, readonly string[]>;

/**
 * The templates the user chose as preferred, in the order they chose them, persisted through the
 * `preferredTemplates` top-level key of `.clutter/workspace.json` — a sibling of `TemplateUsageStore`'s
 * `templateUsage` and the other keys that file holds (ADR-033/052's sibling-store shape): one reader, one
 * writer, loaded once at boot, in-memory authoritative, never Gate-backed (`.clutter/*` is application
 * infrastructure — ARCHITECTURE_RULES.md rule 2) and never owned by `Workspace`.
 *
 * Per Space, because a template is identified by its page's immutable id, which means nothing in another
 * Space. Only ids are stored (a title can change). Removing an id removes only the preference — never the
 * template. An id whose template has since been deleted or archived is inert here: it stays in the list
 * (so a restored template reappears), and whoever shows the list skips what it cannot resolve.
 *
 * Persisted per context (see `PreferredTemplatesContext`): `{ "preferredTemplates": ["<id>", ...], "preferredNoteTemplates": ["<id>", ...] }`
 *
 * It also holds the one *default* template a new Daily Note gets applied automatically
 * (`defaultDailyNoteTemplate`: a template page id, absent for None). That is a different thing from the
 * lists above — they order suggestions, this one is applied — so it is a separate value, never a member of
 * a list; it lives here because it is the same kind of thing (a per-Space template choice by id, with the
 * same lifecycle: inert while its template is unavailable, dropped when the template is permanently deleted).
 */
export class PreferredTemplatesStore implements Observable {
  private ids: IdsByContext;
  private defaultDailyNoteTemplateId: string | undefined;
  private readonly listeners = new Set<ChangeListener>();

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    ids: IdsByContext,
    defaultDailyNoteTemplateId?: string
  ) {
    this.ids = ids;
    this.defaultDailyNoteTemplateId = defaultDailyNoteTemplateId;
  }

  /** A store with no preferred templates; the default for tests and a missing file. */
  static empty(
    fileSystem: VaultFileSystem,
    rootPath: string
  ): PreferredTemplatesStore {
    return new PreferredTemplatesStore(fileSystem, rootPath, {
      dailyNotes: [],
      notes: [],
    });
  }

  /**
   * Reads the persisted list. Never throws: malformed JSON, a non-object file or a non-array
   * `preferredTemplates` is logged and discarded, and non-string or duplicate entries are dropped without
   * affecting the rest — the same boot-time posture as every other store of this file.
   */
  static async load(
    fileSystem: VaultFileSystem,
    rootPath: string
  ): Promise<PreferredTemplatesStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `PreferredTemplatesStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no preferred templates.`
      );
      return PreferredTemplatesStore.empty(fileSystem, rootPath);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      console.warn(
        `PreferredTemplatesStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no preferred templates.`
      );
      return PreferredTemplatesStore.empty(fileSystem, rootPath);
    }

    const record = parsed as Record<string, unknown>;
    const ids = {} as Record<PreferredTemplatesContext, string[]>;

    for (const context of CONTEXTS) {
      ids[context] = readIds(record[STORAGE_KEYS[context]], STORAGE_KEYS[context]);
    }

    const defaultDaily = record.defaultDailyNoteTemplate;

    return new PreferredTemplatesStore(
      fileSystem,
      rootPath,
      ids,
      typeof defaultDaily === 'string' && defaultDaily !== '' ? defaultDaily : undefined
    );
  }

  /** The preferred template ids of `context`, in selection order. The same array until that list changes. */
  getIds(context: PreferredTemplatesContext = 'dailyNotes'): readonly string[] {
    return this.ids[context];
  }

  /** The template applied to a new Daily Note, or `undefined` for None (the default). It may name a template that is gone. */
  getDefaultDailyNoteTemplateId(): string | undefined {
    return this.defaultDailyNoteTemplateId;
  }

  /** Chooses the template a new Daily Note gets (a template page id), or `undefined` for None. */
  setDefaultDailyNoteTemplate(templateId: string | undefined): void {
    if (templateId === this.defaultDailyNoteTemplateId) {
      return;
    }

    this.change(this.ids, { value: templateId });
  }

  /** Appends `templateId` to `context`'s list. A template already in it is left where it is — never duplicated. */
  add(templateId: string, context: PreferredTemplatesContext = 'dailyNotes'): void {
    if (this.ids[context].includes(templateId)) {
      return;
    }

    this.change({ ...this.ids, [context]: [...this.ids[context], templateId] });
  }

  /** Removes `templateId` from `context`'s list — only the preference; the template itself is never touched. */
  remove(templateId: string, context: PreferredTemplatesContext = 'dailyNotes'): void {
    if (!this.ids[context].includes(templateId)) {
      return;
    }

    this.change({
      ...this.ids,
      [context]: this.ids[context].filter((id) => id !== templateId),
    });
  }

  /**
   * Removes every id in `templateIds` from every context's list, in one change (one notification, one write).
   * The rest keep their order; ids that were never preferred are ignored, and if none was, nothing happens.
   * For a template (or a folder of them) being permanently deleted — the one time a preference is dropped
   * without the user asking: archiving and moving are reversible and never call this.
   */
  removeAll(templateIds: readonly string[]): void {
    const doomed = new Set(templateIds);
    const next = { ...this.ids };
    let changed = false;

    for (const context of CONTEXTS) {
      const remaining = this.ids[context].filter((id) => !doomed.has(id));

      if (remaining.length !== this.ids[context].length) {
        next[context] = remaining;
        changed = true;
      }
    }

    const defaultDropped =
      this.defaultDailyNoteTemplateId !== undefined && doomed.has(this.defaultDailyNoteTemplateId);

    if (changed || defaultDropped) {
      this.change(next, defaultDropped ? { value: undefined } : undefined);
    }
  }

  /** Arrow properties, so the same function identities can be handed straight to a UI subscription. */
  subscribe = (listener: ChangeListener): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  /** `defaultChange` is given only when the default changes too; wrapped, so that clearing it (undefined) is still a change. */
  private change(ids: IdsByContext, defaultChange?: { readonly value: string | undefined }): void {
    this.ids = ids;

    if (defaultChange) {
      this.defaultDailyNoteTemplateId = defaultChange.value;
    }
    this.listeners.forEach((listener) => listener());
    void this.persist();
  }

  /**
   * Fire-and-forget, the accepted posture of the other `.clutter/workspace.json` stores. Writes through
   * `mergeAndWriteWorkspaceStateFile`, which re-reads the file's other keys right before writing so a
   * sibling store's key is never clobbered.
   */
  private async persist(): Promise<void> {
    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      [STORAGE_KEYS.dailyNotes]: [...this.ids.dailyNotes],
      [STORAGE_KEYS.notes]: [...this.ids.notes],
      defaultDailyNoteTemplate: this.defaultDailyNoteTemplateId,
    });
  }
}

/**
 * One context's persisted list. Never throws: a missing key is an empty list, a non-array value is logged and
 * discarded, and non-string, empty or duplicate entries are dropped without affecting the rest.
 */
function readIds(value: unknown, key: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    console.warn(
      `PreferredTemplatesStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "${key}" is not an array — discarding it.`
    );
    return [];
  }

  const ids: string[] = [];

  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '' && !ids.includes(entry)) {
      ids.push(entry);
    } else {
      console.warn(
        'PreferredTemplatesStore: discarding a malformed or duplicate preferred template entry.'
      );
    }
  }

  return ids;
}
