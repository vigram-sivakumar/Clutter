/**
 * Where recovery records live. A directory per vault key, one JSON file per note. Deliberately tiny: this is not a
 * general persistence layer, just the four operations the journal needs.
 *
 * `writeAtomic` must leave any earlier file intact if it fails part-way (write a temporary file, then rename it over
 * the real one), so a crash during a snapshot never destroys the previous valid record.
 */
export interface RecoveryStorage {
  /** The record file names in `dir`, or [] when it does not exist. */
  list(dir: string): Promise<string[]>;
  /** The file's text, or null when it does not exist. */
  read(dir: string, name: string): Promise<string | null>;
  writeAtomic(dir: string, name: string, text: string): Promise<void>;
  /** Removes the file; a file that is already gone is not an error. */
  remove(dir: string, name: string): Promise<void>;
}

/** In-memory storage: tests, and the place a record "lives" when no real location is available. */
export class MemoryRecoveryStorage implements RecoveryStorage {
  public readonly files = new Map<string, string>();
  /** Test hook: makes the next writes fail with this error (cleared with `null`). */
  public failWrites: Error | null = null;

  async list(dir: string): Promise<string[]> {
    const prefix = `${dir}/`;
    return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }

  async read(dir: string, name: string): Promise<string | null> {
    return this.files.get(`${dir}/${name}`) ?? null;
  }

  async writeAtomic(dir: string, name: string, text: string): Promise<void> {
    if (this.failWrites) {
      throw this.failWrites;
    }
    this.files.set(`${dir}/${name}`, text);
  }

  async remove(dir: string, name: string): Promise<void> {
    this.files.delete(`${dir}/${name}`);
  }
}

const BROWSER_PREFIX = 'clutter-recovery/';

/**
 * Browser localStorage storage, for the web runtime only (a development and test surface; the desktop app uses
 * TauriRecoveryStorage). Each write replaces one key, which the browser applies as a unit.
 */
export class BrowserRecoveryStorage implements RecoveryStorage {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  async list(dir: string): Promise<string[]> {
    const prefix = `${BROWSER_PREFIX}${dir}/`;
    const names: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key?.startsWith(prefix)) names.push(key.slice(prefix.length));
    }
    return names;
  }

  async read(dir: string, name: string): Promise<string | null> {
    return this.storage.getItem(`${BROWSER_PREFIX}${dir}/${name}`);
  }

  async writeAtomic(dir: string, name: string, text: string): Promise<void> {
    this.storage.setItem(`${BROWSER_PREFIX}${dir}/${name}`, text);
  }

  async remove(dir: string, name: string): Promise<void> {
    this.storage.removeItem(`${BROWSER_PREFIX}${dir}/${name}`);
  }
}
