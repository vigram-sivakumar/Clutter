import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';

/**
 * The avatar a Space carries. An image is a *vault-relative* reference to a file inside the Space
 * (`Assets/…`), never a path outside it, so it travels with the folder.
 */
export type SpaceProfileAvatar =
  | { readonly type: 'emoji'; readonly emoji: string }
  | { readonly type: 'image'; readonly src: string };

/**
 * What a Space knows about itself, durably: a stable identity (the folder path is only its location)
 * and its own configuration. Stored in the Space, in the `space` key of `.clutter/workspace.json`.
 */
export interface SpaceProfile {
  readonly id: string;
  readonly avatar?: SpaceProfileAvatar;
  /**
   * The folder (by id, so a rename or move keeps it) where a new note is created when nothing says otherwise.
   * Absent means Inbox, the default. Whoever reads it checks it is still a valid destination.
   */
  readonly defaultNoteFolderId?: string;
  /**
   * Where a cover image goes on a note of this Space that has no saved position: `'side'` (Right) or `'above'`
   * (Top). Stored explicitly when chosen — Right included — so "chose the default" can be told from "never chose"
   * (a Space that never chose may still be seeded from the old app-wide setting, once).
   */
  readonly defaultCoverPosition?: 'side' | 'above';
  /** Whether this Space deletes archived items after 30 days. Present only when on; absent is off, the default. */
  readonly autoDeleteArchived?: true;
}

const SPACE_KEY = 'space';
const CURRENT_VERSION = 1;

function parseAvatar(value: unknown): SpaceProfileAvatar | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { type, emoji, src } = value as { type?: unknown; emoji?: unknown; src?: unknown };
  if (type === 'emoji' && typeof emoji === 'string' && emoji !== '') return { type, emoji };
  if (type === 'image' && typeof src === 'string' && src !== '') return { type, src };
  return undefined;
}

/**
 * Tolerant parse of a `.clutter/workspace.json` text: a profile exists only when it has an id. Anything
 * missing, malformed, or written by a newer version is "no profile" — never an error, never a write.
 */
export function parseSpaceProfile(contents: string): SpaceProfile | null {
  try {
    const file: unknown = JSON.parse(contents);
    if (typeof file !== 'object' || file === null || Array.isArray(file)) return null;
    const raw = (file as Record<string, unknown>)[SPACE_KEY];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const { version, id, avatar, defaultNoteFolderId, defaultCoverPosition, autoDeleteArchived } = raw as {
      version?: unknown;
      id?: unknown;
      avatar?: unknown;
      defaultNoteFolderId?: unknown;
      defaultCoverPosition?: unknown;
      autoDeleteArchived?: unknown;
    };
    if (typeof version === 'number' && version > CURRENT_VERSION) return null;
    if (typeof id !== 'string' || id === '') return null;
    const parsedAvatar = parseAvatar(avatar);
    return {
      id,
      ...(parsedAvatar && { avatar: parsedAvatar }),
      ...(typeof defaultNoteFolderId === 'string' &&
        defaultNoteFolderId !== '' && { defaultNoteFolderId }),
      // Anything but a known value is "never chose" (a hand-edited or newer file never changes behaviour), and
      // only a literal `true` turns the destructive cleanup on.
      ...((defaultCoverPosition === 'side' || defaultCoverPosition === 'above') && { defaultCoverPosition }),
      ...(autoDeleteArchived === true && { autoDeleteArchived: true as const }),
    };
  } catch {
    return null;
  }
}

/**
 * Reads a Space's profile without opening it — what "Select a folder" uses to recognize a Space. Strictly
 * read-only: it never creates `.clutter`, never writes, and never throws (an unreadable folder is "no profile").
 */
export async function readSpaceProfile(
  fileSystem: VaultFileSystem,
  rootPath: string
): Promise<SpaceProfile | null> {
  try {
    return parseSpaceProfile(await readWorkspaceStateFileText(fileSystem, rootPath));
  } catch {
    return null;
  }
}

/**
 * The persistence boundary for a Space's own profile: owns the `space` key of `.clutter/workspace.json`
 * end-to-end (one reader, one writer) alongside the file's other owners, the sibling-store shape ADR-033 and
 * ADR-035 set out. Not Gate-backed — `.clutter/*` is application infrastructure (ARCHITECTURE_RULES.md rule 2).
 *
 * Nothing here writes on its own: loading is read-only, and a profile is only ever written when the caller
 * asks — to give an identity to a Space that has none (`ensureIdentity`, the deliberate, lazy migration of
 * a Space that predates identities), to change its avatar (`setAvatar`) or to choose where new notes go
 * (`setDefaultNoteFolder`).
 */
export class SpaceProfileStore {
  private readonly listeners = new Set<() => void>();

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private current: SpaceProfile | null
  ) {}

  /** An empty store — `Application`'s constructor default, for tests that construct it directly. */
  static empty(fileSystem: VaultFileSystem, rootPath: string): SpaceProfileStore {
    return new SpaceProfileStore(fileSystem, rootPath, null);
  }

  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<SpaceProfileStore> {
    return new SpaceProfileStore(fileSystem, rootPath, await readSpaceProfile(fileSystem, rootPath));
  }

  /** `null` for a Space that has no identity yet. */
  get profile(): SpaceProfile | null {
    return this.current;
  }

  /** Gives the Space an identity if it has none; a no-op (no write) when it already has one. */
  async ensureIdentity(): Promise<SpaceProfile> {
    if (this.current) return this.current;
    return this.write({ id: new UuidGenerator().generate() });
  }

  /** Sets, or with `undefined` removes, the Space's avatar. Gives the Space an identity first if needed. */
  async setAvatar(avatar: SpaceProfileAvatar | undefined): Promise<SpaceProfile> {
    const base = await this.ensureIdentity();
    const { avatar: _previous, ...rest } = base;
    return this.write(avatar ? { ...rest, avatar } : rest);
  }

  /**
   * Chooses where new notes are created — a folder id, or `undefined` for Inbox, the default. Takes effect (and
   * notifies subscribers) at once; the file follows. Choosing Inbox in a Space with no profile changes nothing
   * and writes nothing: it would not give the Space an identity just to say "the default".
   */
  setDefaultNoteFolder(folderId: string | undefined): Promise<SpaceProfile | null> {
    if (!this.current && folderId === undefined) {
      return Promise.resolve(null);
    }

    const { defaultNoteFolderId: _previous, ...rest } = this.current ?? { id: new UuidGenerator().generate() };
    const next = folderId === undefined ? rest : { ...rest, defaultNoteFolderId: folderId };

    return this.persistSetting(next).then(() => next);
  }

  /**
   * Chooses where covers go on notes of this Space with no saved position. Always written explicitly, `'side'`
   * too: removing the value would make a chosen Right look like a Space that never chose.
   */
  setDefaultCoverPosition(position: 'side' | 'above'): Promise<void> {
    if (this.current?.defaultCoverPosition === position) {
      return Promise.resolve();
    }

    const base = this.current ?? { id: new UuidGenerator().generate() };
    return this.persistSetting({ ...base, defaultCoverPosition: position });
  }

  /**
   * Turns this Space's automatic cleanup of archived items on or off. Off removes the value, which is also what
   * a Space that never chose has: off is the default, and nothing is ever deleted unless this was set to on.
   */
  setAutoDeleteArchived(enabled: boolean): Promise<void> {
    // Already as asked — on, or off (which is also what a Space with no value has): nothing to change or write.
    if (enabled === (this.current?.autoDeleteArchived === true)) {
      return Promise.resolve();
    }

    const { autoDeleteArchived: _previous, ...rest } = this.current ?? { id: new UuidGenerator().generate() };
    return this.persistSetting(enabled ? { ...rest, autoDeleteArchived: true } : rest);
  }

  /** Called whenever the profile changes. Returns the unsubscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private readonly writeErrorListeners = new Set<(error: unknown) => void>();

  /**
   * Called when a setting's file write failed. The setting still holds in memory for this session — so the UI is
   * not lied to the other way — but it did not reach the file, and whoever shows messages should say so.
   */
  subscribeWriteError = (listener: (error: unknown) => void): (() => void) => {
    this.writeErrorListeners.add(listener);
    return () => {
      this.writeErrorListeners.delete(listener);
    };
  };

  /**
   * A setting change: in memory at once, the file after, and a failed write reported rather than lost. Never
   * rejects, because every caller is a fire-and-forget settings control; the avatar flows, which do need to hear
   * about a failure, await `write` directly.
   */
  private persistSetting(profile: SpaceProfile): Promise<void> {
    return this.write(profile).then(
      () => undefined,
      (error: unknown) => this.writeErrorListeners.forEach((listener) => listener(error))
    );
  }

  private async write(profile: SpaceProfile): Promise<SpaceProfile> {
    // In memory first, so a change is visible immediately; the file follows.
    this.current = profile;
    this.listeners.forEach((listener) => listener());
    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      [SPACE_KEY]: { version: CURRENT_VERSION, ...profile },
    });
    return profile;
  }
}
