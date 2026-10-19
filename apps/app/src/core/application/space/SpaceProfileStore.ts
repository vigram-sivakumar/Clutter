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
    const { version, id, avatar } = raw as { version?: unknown; id?: unknown; avatar?: unknown };
    if (typeof version === 'number' && version > CURRENT_VERSION) return null;
    if (typeof id !== 'string' || id === '') return null;
    const parsedAvatar = parseAvatar(avatar);
    return parsedAvatar ? { id, avatar: parsedAvatar } : { id };
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
 * a Space that predates identities) or to change its avatar (`setAvatar`).
 */
export class SpaceProfileStore {
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
    return this.write(avatar ? { id: base.id, avatar } : { id: base.id });
  }

  private async write(profile: SpaceProfile): Promise<SpaceProfile> {
    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      [SPACE_KEY]: { version: CURRENT_VERSION, ...profile },
    });
    this.current = profile;
    return profile;
  }
}
