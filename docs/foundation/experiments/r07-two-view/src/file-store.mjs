import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Writes only an explicitly initialized experiment directory. Never an app vault.
export class FileStore {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const marker = join(this.directory, 'EXPERIMENT-ONLY');
    if (!existsSync(marker)) {
      if (readdirSync(this.directory).length)
        throw new Error('REFUSE_NONEMPTY_UNMARKED_DIRECTORY');
      writeFileSync(marker, 'clutter-r07-v1\n', { flag: 'wx', mode: 0o600 });
    }
    if (readFileSync(marker, 'utf8') !== 'clutter-r07-v1\n')
      throw new Error('INVALID_LAB_MARKER');
    this.lockPath = join(this.directory, 'owner.lock');
    this.lock = openSync(this.lockPath, 'wx', 0o600);
    this.failSave = false;
    this.failProtect = false;
  }
  read() {
    const records = ['snapshot.json', 'recovery.json']
      .filter((name) => existsSync(join(this.directory, name)))
      .map((name) => {
        const bytes = readFileSync(join(this.directory, name));
        if (bytes.length > 16777216) throw new Error('SNAPSHOT_LIMIT');
        const snapshot = JSON.parse(bytes.toString('utf8'));
        if (!Array.isArray(snapshot.steps)) throw new Error('INVALID_SNAPSHOT');
        return snapshot;
      });
    // A previous rescue may remain if a newer snapshot was published immediately
    // before interruption. Never prefer an older rescue over a newer snapshot.
    records.sort((a, b) => b.steps.length - a.steps.length);
    return records[0] ?? null;
  }

  atomic(name, snapshot) {
    const tmp = join(this.directory, '.' + randomUUID() + '.next');
    let fd;
    try {
      fd = openSync(tmp, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(snapshot));
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(tmp, join(this.directory, name));
      this.flushDirectory();
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(tmp)) unlinkSync(tmp);
    }
  }
  flushDirectory() {
    const fd = openSync(this.directory, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  write(snapshot) {
    if (this.failSave) throw new Error('injected save failure');
    this.atomic('snapshot.json', snapshot);
    const recovery = join(this.directory, 'recovery.json');
    if (existsSync(recovery)) {
      unlinkSync(recovery);
      this.flushDirectory();
    }
  }
  protect(snapshot) {
    if (this.failProtect) throw new Error('injected protection failure');
    this.atomic('recovery.json', snapshot);
  }
  close() {
    if (this.lock === undefined) return;
    closeSync(this.lock);
    this.lock = undefined;
    unlinkSync(this.lockPath);
  }
}
