import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  lstatSync,
  readFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { Fault, stable } from '../contracts.ts';
import type { Mutation, Receipt } from '../contracts.ts';
import type { Root, Stored, Vault, RootChange } from '../ports.ts';
import { atomic, CommitUnknown } from './sql-transaction.ts';
const digest = (x: string | Uint8Array) =>
  createHash('sha256').update(x).digest('hex');
const markerName = 'I1-DISPOSABLE.json';
const format = 'CLUTTER-I1-DISPOSABLE-25';
type Hooks = { beforeCommit?: () => void; afterCommit?: () => void };
type Row = {
  page_id: string;
  kind: 'note' | 'task';
  root_hash: string;
  payload: Uint8Array;
  sequence: number;
};
/** Experimental local adapter. Never accepts a user-selected vault for creation. */
export class SqliteVault implements Vault {
  readonly directory: string;
  readonly spaceId: string;
  private readonly db: DatabaseSync;
  private readonly hooks: Hooks;
  private uncertain?: string;
  private failed = false;
  private constructor(
    directory: string,
    initialize: boolean,
    hooks: Hooks = {}
  ) {
    const canonical = realpathSync(directory),
      temp = realpathSync(tmpdir());
    if (
      canonical !== directory ||
      dirname(canonical) !== temp ||
      !/^clutter-i1-[A-Za-z0-9]+$/.test(basename(canonical)) ||
      lstatSync(directory).isSymbolicLink()
    )
      throw new Fault('NOT_DISPOSABLE');
    const regular = (p: string) => {
      const s = lstatSync(p);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1)
        throw new Fault('NOT_DISPOSABLE');
    };
    regular(join(directory, markerName));
    const marker = JSON.parse(
      readFileSync(join(directory, markerName), 'utf8')
    );
    if (
      Object.keys(marker).sort().join() !== 'format,spaceId' ||
      marker.format !== format ||
      !/^[a-f0-9-]{36}$/.test(marker.spaceId)
    )
      throw new Fault('NOT_DISPOSABLE');
    this.directory = directory;
    this.spaceId = marker.spaceId;
    this.hooks = hooks;
    const file = join(directory, 'space.sqlite');
    if (!initialize) regular(file);
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        lstatSync(file + suffix);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw e;
      }
      regular(file + suffix);
    }
    this.db = new DatabaseSync(file, { open: true });
    try {
      this.db.exec(
        'PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; BEGIN EXCLUSIVE; COMMIT;'
      );
      if (initialize) {
        this.db.exec(`BEGIN EXCLUSIVE;
          CREATE TABLE identity(format TEXT NOT NULL,space_id TEXT NOT NULL);
          CREATE TABLE roots(page_id TEXT NOT NULL,kind TEXT NOT NULL,root_hash TEXT NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(page_id,root_hash));
          CREATE TABLE commits(sequence INTEGER PRIMARY KEY,operation_id TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,receipt TEXT NOT NULL);
          CREATE TABLE revisions(sequence INTEGER NOT NULL REFERENCES commits(sequence),page_id TEXT NOT NULL,root_hash TEXT NOT NULL,PRIMARY KEY(sequence,page_id),FOREIGN KEY(page_id,root_hash) REFERENCES roots(page_id,root_hash));
          CREATE TABLE heads(page_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL,FOREIGN KEY(sequence,page_id) REFERENCES revisions(sequence,page_id));`);
        this.db
          .prepare('INSERT INTO identity VALUES(?,?)')
          .run(format, this.spaceId);
        this.db.exec('PRAGMA user_version=1; COMMIT;');
        chmodSync(file, 0o600);
      }
      this.check();
    } catch (e) {
      try {
        this.db.close();
      } catch {}
      throw e;
    }
  }
  static createDisposable(hooks: Hooks = {}): SqliteVault {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'clutter-i1-'));
    chmodSync(directory, 0o700);
    writeFileSync(
      join(directory, markerName),
      JSON.stringify({ format, spaceId: randomUUID() }),
      { mode: 0o600, flag: 'wx' }
    );
    return new SqliteVault(directory, true, hooks);
  }
  static reopenDisposable(directory: string, hooks: Hooks = {}): SqliteVault {
    return new SqliteVault(directory, false, hooks);
  }
  private check(): void {
    const version = this.db.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    const identity = this.db.prepare('SELECT * FROM identity').all() as {
      format: string;
      space_id: string;
    }[];
    if (
      version.user_version !== 1 ||
      identity.length !== 1 ||
      identity[0].format !== format ||
      identity[0].space_id !== this.spaceId
    )
      throw new Fault('UNSUPPORTED_STORE');
    if (
      this.db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' ||
      this.db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Fault('BROKEN_STORE');
    for (const row of this.db
      .prepare('SELECT * FROM roots')
      .all() as unknown as Row[])
      this.root(row);
    const commits = this.db
      .prepare('SELECT * FROM commits ORDER BY sequence')
      .all();
    for (const [i, c] of commits.entries()) {
      const r = JSON.parse(c.receipt as string) as Receipt;
      const revisions = this.db
        .prepare(
          'SELECT page_id,root_hash FROM revisions WHERE sequence=? ORDER BY page_id'
        )
        .all(c.sequence!);
      const heads = Object.fromEntries(
        revisions.map((v) => [v.page_id, v.root_hash])
      );
      if (
        c.sequence !== i + 1 ||
        r.sequence !== c.sequence ||
        r.operationId !== c.operation_id ||
        !revisions.length ||
        r.head !== heads[r.pageId] ||
        stable(r.changedHeads) !== stable(heads)
      )
        throw new Fault('BROKEN_STORE');
    }
    const bad = this.db
      .prepare(
        'SELECT page_id FROM revisions GROUP BY page_id HAVING MAX(sequence) != COALESCE((SELECT sequence FROM heads WHERE heads.page_id=revisions.page_id),0)'
      )
      .all();
    if (bad.length) throw new Fault('BROKEN_STORE');
  }

  private root(row: Row): Root {
    if (
      !['note', 'task'].includes(row.kind) ||
      digest(row.payload) !== row.root_hash
    )
      throw new Fault('BROKEN_ROOT');
    return {
      pageId: row.page_id,
      kind: row.kind,
      head: row.root_hash,
      bytes: new Uint8Array(row.payload),
    };
  }
  load(pageId: string, atSequence?: number): Stored | undefined {
    const row = this.db
      .prepare(
        `SELECT r.*,c.sequence FROM revisions c JOIN roots r ON r.page_id=c.page_id AND r.root_hash=c.root_hash WHERE c.page_id=? AND c.sequence<=? ORDER BY c.sequence DESC LIMIT 1`
      )
      .get(pageId, atSequence ?? Number.MAX_SAFE_INTEGER) as Row | undefined;
    return row ? { ...this.root(row), sequence: row.sequence } : undefined;
  }
  outcome(command: Mutation): Receipt | undefined {
    if (this.failed) throw new Fault('STORE_UNAVAILABLE');
    const row = this.db
      .prepare('SELECT * FROM commits WHERE operation_id=?')
      .get(command.operationId);
    if (row) {
      if (row.fingerprint !== digest(stable(command)))
        throw new Fault('OPERATION_ID_REUSED');
      if (this.uncertain === command.operationId) this.uncertain = undefined;
      return JSON.parse(row.receipt as string);
    }
    // This process retained a COMMIT uncertainty; reopen is required before a new write.
    if (this.uncertain)
      throw new Fault(
        this.uncertain === command.operationId
          ? 'OUTCOME_UNKNOWN'
          : 'UNRESOLVED_OPERATION'
      );
    return undefined;
  }
  async commit(
    command: Mutation,
    changes: readonly RootChange[]
  ): Promise<Receipt> {
    const prior = this.outcome(command);
    if (prior) return prior;
    const changedHeads = Object.create(null) as Record<string, string>;
    for (const { root } of changes) {
      if (
        Object.hasOwn(changedHeads, root.pageId) ||
        !root.pageId ||
        digest(root.bytes) !== root.head ||
        root.bytes.length > 1500000
      )
        throw new Fault('INVALID_ROOT');
      changedHeads[root.pageId] = root.head;
    }
    if (!Object.hasOwn(changedHeads, command.pageId))
      throw new Fault('INVALID_ROOT');
    try {
      return await atomic(
        this.db,
        () => {
          // All guards are checked before any root/head/outcome write.
          for (const { root, expectedHead } of changes)
            if ((this.load(root.pageId)?.head ?? null) !== expectedHead)
              throw new Fault('CONFLICT');
          const sequence = Number(
            this.db
              .prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM commits')
              .get()!.n
          );
          const receipt = {
            operationId: command.operationId,
            pageId: command.pageId,
            head: changedHeads[command.pageId],
            sequence,
            changedHeads: { ...changedHeads },
          };
          for (const { root } of changes)
            this.db
              .prepare('INSERT OR IGNORE INTO roots VALUES(?,?,?,?)')
              .run(root.pageId, root.kind, root.head, root.bytes);
          this.db
            .prepare('INSERT INTO commits VALUES(?,?,?,?)')
            .run(
              sequence,
              command.operationId,
              digest(stable(command)),
              stable(receipt)
            );
          for (const { root } of changes) {
            this.db
              .prepare('INSERT INTO revisions VALUES(?,?,?)')
              .run(sequence, root.pageId, root.head);
            this.db
              .prepare(
                'INSERT INTO heads VALUES(?,?) ON CONFLICT(page_id) DO UPDATE SET sequence=excluded.sequence'
              )
              .run(root.pageId, sequence);
          }
          this.hooks.beforeCommit?.();
          return receipt;
        },
        this.hooks.afterCommit
      );
    } catch (e) {
      if (e instanceof CommitUnknown) {
        this.uncertain = command.operationId;
        this.failed = e.rollbackFailed;
        throw new Fault('OUTCOME_UNKNOWN');
      }
      throw e;
    }
  }
  close(): void {
    this.db.close();
  }
}
