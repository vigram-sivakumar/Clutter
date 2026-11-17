import { hash } from './media-formats.mjs';
import { directories, publish, readObject } from './media-files.mjs';
import type { AssetFileHost } from './media-files.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
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
import {
  Fault,
  stable,
  parseCommand,
  parseAssetLinks,
  parseAssetMeta,
} from '../../core/src/contracts.ts';
import type {
  Mutation,
  Receipt,
  AssetLinks,
  AssetMeta,
  AssetLink,
} from '../../core/src/contracts.ts';
import type {
  Root,
  Stored,
  SpaceStore,
  RootChange,
  CommitOptions,
  RecoveryRoot,
} from '../../core/src/ports.ts';
import { atomic, CommitUnknown } from './sql-transaction.ts';
const digest = hash;
const markerName = 'I1-DISPOSABLE.json';
const format = 'CLUTTER-I1-DISPOSABLE-25';
type Hooks = {
  assetPhase?: (name: string, command: Mutation) => Promise<void> | void;
  beforeCommit?: (command: Mutation) => void;
  afterCommit?: (command: Mutation) => void;
};
type Row = {
  page_id: string;
  kind: 'note' | 'task';
  root_hash: string;
  payload: Uint8Array;
  sequence: number;
};
/** Experimental local adapter. Never accepts a user-selected vault for creation. */
export class SqliteStore implements SpaceStore {
  readonly directory: string;
  readonly spaceId: string;
  private readonly db: DatabaseSync;
  private readonly hooks: Hooks;
  private readonly fileHost: AssetFileHost;
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
        (process.platform === 'darwin'
          ? 'PRAGMA fullfsync=ON; PRAGMA checkpoint_fullfsync=ON; '
          : '') +
          'PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; BEGIN EXCLUSIVE; COMMIT;'
      );
      if (initialize) {
        this.db.exec(`BEGIN EXCLUSIVE;
          CREATE TABLE identity(format TEXT NOT NULL,space_id TEXT NOT NULL);
          CREATE TABLE roots(page_id TEXT NOT NULL,kind TEXT NOT NULL,root_hash TEXT NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(page_id,root_hash));
          CREATE TABLE commits(sequence INTEGER PRIMARY KEY,operation_id TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,receipt TEXT NOT NULL,actor_id TEXT NOT NULL);
          CREATE TABLE revisions(sequence INTEGER NOT NULL REFERENCES commits(sequence),page_id TEXT NOT NULL,root_hash TEXT NOT NULL,PRIMARY KEY(sequence,page_id),FOREIGN KEY(page_id,root_hash) REFERENCES roots(page_id,root_hash));
          CREATE TABLE asset_objects(hash TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes INTEGER NOT NULL);
          CREATE TABLE asset_refs(page_id TEXT NOT NULL,root_hash TEXT NOT NULL,attachment_id TEXT NOT NULL,hash TEXT NOT NULL REFERENCES asset_objects(hash),name TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(page_id,root_hash,attachment_id),FOREIGN KEY(page_id,root_hash) REFERENCES roots(page_id,root_hash));
          CREATE TABLE heads(page_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL,FOREIGN KEY(sequence,page_id) REFERENCES revisions(sequence,page_id));
          CREATE TABLE protections(sequence INTEGER PRIMARY KEY REFERENCES commits(sequence),page_id TEXT NOT NULL,context_id TEXT NOT NULL,actor_id TEXT NOT NULL,generation INTEGER NOT NULL,base_head TEXT NOT NULL,root_hash TEXT NOT NULL,pending TEXT,FOREIGN KEY(page_id,root_hash) REFERENCES roots(page_id,root_hash),UNIQUE(page_id,context_id,actor_id,generation));`);
        this.db
          .prepare('INSERT INTO identity VALUES(?,?)')
          .run(format, this.spaceId);
        this.db.exec('PRAGMA user_version=3; COMMIT;');
        chmodSync(file, 0o600);
      }
      if (this.db.prepare('PRAGMA user_version').get()?.user_version !== 3)
        throw new Fault('UNSUPPORTED_STORE');
      this.fileHost = {
        dir: this.directory,
        phase: async (name, command) => {
          await this.hooks.assetPhase?.(name, command as Mutation);
        },
      };
      directories(this.fileHost, { create: initialize });
      this.check();
    } catch (e) {
      try {
        this.db.close();
      } catch {}
      throw e;
    }
  }
  static createDisposable(hooks: Hooks = {}): SqliteStore {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'clutter-i1-'));
    chmodSync(directory, 0o700);
    writeFileSync(
      join(directory, markerName),
      JSON.stringify({ format, spaceId: randomUUID() }),
      { mode: 0o600, flag: 'wx' }
    );
    return new SqliteStore(directory, true, hooks);
  }
  static reopenDisposable(directory: string, hooks: Hooks = {}): SqliteStore {
    return new SqliteStore(directory, false, hooks);
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
      version.user_version !== 3 ||
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
    for (const row of this.db.prepare('SELECT hash FROM asset_objects').all())
      this.readAsset(row.hash as string);
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
        (!r.protection && (!revisions.length || r.head !== heads[r.pageId])) ||
        stable(r.changedHeads) !== stable(heads)
      )
        throw new Fault('BROKEN_STORE');
      if (r.protection) {
        const p = this.db
          .prepare('SELECT * FROM protections WHERE sequence=?')
          .get(c.sequence!);
        if (
          !p ||
          revisions.length ||
          r.head !== p.root_hash ||
          r.pageId !== p.page_id ||
          r.protection.contextId !== p.context_id ||
          r.protection.generation !== p.generation ||
          r.protection.baseHead !== p.base_head ||
          c.actor_id !== p.actor_id ||
          !this.findRoot(r.pageId, p.base_head as string)
        )
          throw new Fault('BROKEN_PROTECTION');
        if (p.pending) {
          const command = parseCommand(JSON.parse(p.pending as string));
          if (
            command.method !== 'editor.apply' ||
            command.pageId !== r.pageId ||
            command.contextId !== p.context_id ||
            command.generation > Number(p.generation)
          )
            throw new Fault('BROKEN_PROTECTION');
        }
      }
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
  list(afterId: string, limit: number): Stored[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101)
      throw new Fault('INVALID_REQUEST');
    return (
      this.db
        .prepare(
          `SELECT r.*,h.sequence FROM heads h
      JOIN revisions v ON v.page_id=h.page_id AND v.sequence=h.sequence
      JOIN roots r ON r.page_id=v.page_id AND r.root_hash=v.root_hash
      WHERE h.page_id > ? COLLATE BINARY ORDER BY h.page_id COLLATE BINARY LIMIT ?`
        )
        .all(afterId, limit) as Row[]
    ).map((row) => ({ ...this.root(row), sequence: row.sequence }));
  }
  load(pageId: string, atSequence?: number): Stored | undefined {
    const row = this.db
      .prepare(
        `SELECT r.*,c.sequence FROM revisions c JOIN roots r ON r.page_id=c.page_id AND r.root_hash=c.root_hash WHERE c.page_id=? AND c.sequence<=? ORDER BY c.sequence DESC LIMIT 1`
      )
      .get(pageId, atSequence ?? Number.MAX_SAFE_INTEGER) as Row | undefined;
    return row ? { ...this.root(row), sequence: row.sequence } : undefined;
  }
  assetMeta(hash: string): AssetMeta {
    const row = this.db
      .prepare('SELECT mime,bytes FROM asset_objects WHERE hash=?')
      .get(hash);
    if (!row) throw new Fault('ASSET_NOT_FOUND');
    return parseAssetMeta(row);
  }
  assetLinks(root: Root): AssetLinks {
    return parseAssetLinks(
      Object.fromEntries(
        this.db
          .prepare(
            'SELECT attachment_id,hash,name,role FROM asset_refs WHERE page_id=? AND root_hash=? ORDER BY attachment_id'
          )
          .all(root.pageId, root.head)
          .map((row) => [
            row.attachment_id,
            { hash: row.hash, name: row.name, role: row.role },
          ])
      )
    );
  }
  currentAttachment(
    attachmentId: string
  ): ({ pageId: string } & AssetLink) | undefined {
    const rows = this.db
      .prepare(
        'SELECT a.* FROM heads h JOIN revisions r ON r.sequence=h.sequence AND r.page_id=h.page_id JOIN asset_refs a ON a.page_id=r.page_id AND a.root_hash=r.root_hash WHERE a.attachment_id=?'
      )
      .all(attachmentId);
    if (rows.length > 1) throw new Fault('BROKEN_ASSET_INDEX');
    const row = rows[0];
    return row
      ? {
          pageId: row.page_id as string,
          ...parseAssetLinks({
            [attachmentId]: { hash: row.hash, name: row.name, role: row.role },
          })[attachmentId],
        }
      : undefined;
  }
  auditRoots(visitor: (root: Root, links: AssetLinks) => void): void {
    for (const row of this.db
      .prepare('SELECT * FROM roots')
      .all() as unknown as Row[]) {
      const root = this.root(row);
      visitor(root, this.assetLinks(root));
    }
  }
  async publishAsset(
    command: Mutation & { mime: AssetMeta['mime'] },
    bytes: Uint8Array
  ): Promise<{ hash: string; meta: AssetMeta }> {
    try {
      const result = await publish(this.fileHost, command, Buffer.from(bytes));
      return { hash: result.digest, meta: parseAssetMeta(result.meta) };
    } catch (e) {
      throw new Fault((e as Error).message);
    }
  }
  readAsset(hash: string): Uint8Array {
    try {
      return readObject(this.fileHost, hash, this.assetMeta(hash));
    } catch (e) {
      throw e instanceof Fault ? e : new Fault((e as Error).message);
    }
  }
  private insertLinks(root: Root, links: AssetLinks = {}): void {
    for (const [id, link] of Object.entries(parseAssetLinks(links)))
      this.db
        .prepare('INSERT OR IGNORE INTO asset_refs VALUES(?,?,?,?,?,?)')
        .run(root.pageId, root.head, id, link.hash, link.name, link.role);
    if (stable(this.assetLinks(root)) !== stable(links))
      throw new Fault('BROKEN_ASSET_INDEX');
  }
  findRoot(pageId: string, head: string): Stored | undefined {
    const row = this.db
      .prepare(
        'SELECT r.*,v.sequence FROM revisions v JOIN roots r ON r.page_id=v.page_id AND r.root_hash=v.root_hash WHERE v.page_id=? AND v.root_hash=? ORDER BY v.sequence DESC LIMIT 1'
      )
      .get(pageId, head) as Row | undefined;
    return row ? { ...this.root(row), sequence: row.sequence } : undefined;
  }
  recovery(
    pageId: string,
    contextId: string,
    actorId: string
  ): RecoveryRoot | undefined {
    const row = this.db
      .prepare(
        'SELECT r.*,p.sequence,p.generation,p.base_head,p.pending FROM protections p JOIN roots r ON r.page_id=p.page_id AND r.root_hash=p.root_hash WHERE p.page_id=? AND p.context_id=? AND p.actor_id=? ORDER BY p.generation DESC LIMIT 1'
      )
      .get(pageId, contextId, actorId) as
      | (Row & {
          generation: number;
          base_head: string;
          pending: string | null;
        })
      | undefined;
    return row
      ? {
          root: { ...this.root(row), sequence: row.sequence },
          contextId,
          generation: row.generation,
          baseHead: row.base_head,
          ...(row.pending ? { pending: JSON.parse(row.pending) } : {}),
        }
      : undefined;
  }
  outcome(command: Mutation, actorId = ''): Receipt | undefined {
    if (this.failed) throw new Fault('STORE_UNAVAILABLE');
    const row = this.db
      .prepare('SELECT * FROM commits WHERE operation_id=?')
      .get(command.operationId);
    if (row) {
      if (row.actor_id !== actorId) throw new Fault('OPERATION_NOT_OWNED');
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
    changes: readonly RootChange[],
    options: CommitOptions = {}
  ): Promise<Receipt> {
    const actorId = options.actorId ?? '',
      protection = options.protection;
    const prior = this.outcome(command, actorId);
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
    if (protection) {
      const root = protection.root;
      if (
        changes.length ||
        root.pageId !== command.pageId ||
        digest(root.bytes) !== root.head ||
        root.bytes.length > 1500000 ||
        !actorId ||
        !this.findRoot(root.pageId, protection.baseHead)
      )
        throw new Fault('INVALID_PROTECTION');
      const old = this.recovery(root.pageId, protection.contextId, actorId);
      if (old && old.generation >= protection.generation)
        throw new Fault('STALE_PROTECTION');
    } else if (!Object.hasOwn(changedHeads, command.pageId))
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
          for (const [hash, meta] of Object.entries(options.objects ?? {})) {
            parseAssetMeta(meta);
            const old = this.db
              .prepare('SELECT mime,bytes FROM asset_objects WHERE hash=?')
              .get(hash);
            if (old && stable(old) !== stable(meta))
              throw new Fault('ASSET_METADATA_MISMATCH');
            // Verify published bytes before allowing any SQL reference.
            readObject(this.fileHost, hash, meta);
            this.db
              .prepare('INSERT OR IGNORE INTO asset_objects VALUES(?,?,?)')
              .run(hash, meta.mime, meta.bytes);
          }
          const receipt = {
            operationId: command.operationId,
            pageId: command.pageId,
            head: protection?.root.head ?? changedHeads[command.pageId],
            ...(protection
              ? {
                  protection: {
                    contextId: protection.contextId,
                    generation: protection.generation,
                    baseHead: protection.baseHead,
                  },
                }
              : {}),
            sequence,
            changedHeads: { ...changedHeads },
          };
          for (const { root } of changes)
            this.db
              .prepare('INSERT OR IGNORE INTO roots VALUES(?,?,?,?)')
              .run(root.pageId, root.kind, root.head, root.bytes);
          if (protection) {
            const root = protection.root;
            this.db
              .prepare('INSERT OR IGNORE INTO roots VALUES(?,?,?,?)')
              .run(root.pageId, root.kind, root.head, root.bytes);
          }
          for (const change of changes)
            this.insertLinks(change.root, change.links);
          if (protection) this.insertLinks(protection.root, protection.links);
          this.db
            .prepare('INSERT INTO commits VALUES(?,?,?,?,?)')
            .run(
              sequence,
              command.operationId,
              digest(stable(command)),
              stable(receipt),
              actorId
            );
          if (protection)
            this.db
              .prepare('INSERT INTO protections VALUES(?,?,?,?,?,?,?,?)')
              .run(
                sequence,
                command.pageId,
                protection.contextId,
                actorId,
                protection.generation,
                protection.baseHead,
                protection.root.head,
                protection.pending ? stable(protection.pending) : null
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
          this.hooks.beforeCommit?.(command);
          return receipt;
        },
        () => this.hooks.afterCommit?.(command)
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
  profile() {
    return {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      schema: 3,
      sqlite: this.db.prepare('SELECT sqlite_version() AS version').get()!
        .version,
      sqlFullSyncConfigured: process.platform === 'darwin',
      pragmas: {
        fullfsync: this.db.prepare('PRAGMA fullfsync').get()!.fullfsync,
        checkpoint_fullfsync: this.db
          .prepare('PRAGMA checkpoint_fullfsync')
          .get()!.checkpoint_fullfsync,
      },
      nativeDurabilityQualified: false,
    };
  }
  close(): void {
    this.db.close();
  }
}
