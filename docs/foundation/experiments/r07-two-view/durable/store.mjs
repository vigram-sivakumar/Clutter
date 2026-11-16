import {
  atomic,
  CommitUnknown,
} from '../../../../../packages/foundation-runtime/src/adapters/sql-transaction.ts';
// P-SQL experiment only. One connection/owner, no Markdown mirror or view cache.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  existsSync,
  lstatSync,
  writeFileSync,
  readFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import { hash, stable } from './model.mjs';
import * as snapshotModel from './model.mjs';
const sync = (p) => {
  const f = openSync(p, 'r');
  try {
    fsyncSync(f);
  } finally {
    closeSync(f);
  }
};
export class Store {
  constructor(
    dir,
    { init = false, model = snapshotModel, nativeFullSync = false } = {}
  ) {
    this.model = model;
    const marker = model.marker ?? 'CLUTTER-R07-DURABLE-EXPERIMENT-1\n';
    this.encode = model.encode ?? stable;
    this.decode = model.decode ?? JSON.parse;
    this.dir = dir;
    this.phase = async () => {};
    if (!existsSync(dir)) {
      if (!init) throw Error('STORE_MISSING');
      mkdirSync(dir, { mode: 0o700 });
    }
    if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory())
      throw Error('UNSAFE_STORE');
    const mark = join(dir, 'EXPERIMENT-ONLY'),
      path = join(dir, 'vault.sqlite');
    if (init) {
      if (readdirSync(dir).length) throw Error('INIT_REQUIRES_EMPTY_DIRECTORY');
      writeFileSync(mark, marker, { flag: 'wx', mode: 0o600 });
      sync(mark);
      sync(dir);
    }
    if (
      !existsSync(mark) ||
      lstatSync(mark).isSymbolicLink() ||
      readFileSync(mark, 'utf8') !== marker
    )
      throw Error('UNMARKED_STORE');
    if (!init && !existsSync(path)) throw Error('DATABASE_MISSING');
    for (const name of ['vault.sqlite', 'vault.sqlite-wal', 'vault.sqlite-shm'])
      if (
        existsSync(join(dir, name)) &&
        lstatSync(join(dir, name)).isSymbolicLink()
      )
        throw Error('UNSAFE_DATABASE');
    this.db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      const db = this.db;
      if (
        !init &&
        db.prepare('PRAGMA user_version').get().user_version !==
          (model.schemaVersion ?? 1)
      )
        throw Error('UNSUPPORTED_SCHEMA');
      if (typeof db.enableDefensive !== 'function')
        throw Error('UNSUPPORTED_NODE_PROFILE');
      db.enableDefensive(true);
      db.exec(
        'PRAGMA busy_timeout=100; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA locking_mode=EXCLUSIVE;'
      );
      if (init) db.exec('PRAGMA page_size=4096');
      db.exec(
        'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=8; PRAGMA cache_spill=ON; BEGIN EXCLUSIVE; COMMIT;'
      );
      if (nativeFullSync) {
        if (process.platform !== 'darwin')
          throw Error('MAC_FLUSH_PROFILE_REQUIRES_MAC');
        db.exec('PRAGMA fullfsync=ON; PRAGMA checkpoint_fullfsync=ON;');
      }
      const sqlite = db
        .prepare(
          'SELECT sqlite_version() AS version, sqlite_source_id() AS source'
        )
        .get();
      if (
        sqlite.version
          .split('.')
          .map((x, i) => Number(x) * [1000000, 1000, 1][i])
          .reduce((a, b) => a + b, 0) < 3051003
      )
        throw Error('UNSUPPORTED_SQLITE_PROFILE');
      const pragmas = Object.fromEntries(
        [
          'journal_mode',
          'synchronous',
          'locking_mode',
          'foreign_keys',
          'trusted_schema',
          'page_size',
          'cache_size',
          'cache_spill',
          'fullfsync',
          'checkpoint_fullfsync',
        ].map((k) => [k, Object.values(db.prepare('PRAGMA ' + k).get())[0]])
      );
      if (
        pragmas.journal_mode !== 'wal' ||
        pragmas.synchronous !== 2 ||
        pragmas.locking_mode !== 'exclusive' ||
        pragmas.foreign_keys !== 1 ||
        pragmas.trusted_schema !== 0 ||
        pragmas.page_size !== 4096 ||
        !pragmas.cache_spill
      )
        throw Error('PROFILE_MISMATCH');
      if (
        nativeFullSync &&
        (pragmas.fullfsync !== 1 || pragmas.checkpoint_fullfsync !== 1)
      )
        throw Error('MAC_FLUSH_PROFILE_MISMATCH');
      this.profile = {
        nativeFullSyncRequired: nativeFullSync,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        sqlite,
        pragmas,
        compileOptions: db
          .prepare('PRAGMA compile_options')
          .all()
          .map((r) => r.compile_options),
      };
      if (init) {
        db.exec(`BEGIN EXCLUSIVE;
      CREATE TABLE revisions(version INTEGER PRIMARY KEY,parent INTEGER,state ${model.storageType ?? 'TEXT'} NOT NULL,hash TEXT NOT NULL,operation_id TEXT UNIQUE);
      CREATE TABLE meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),space_id TEXT NOT NULL,document_id TEXT NOT NULL,current_version INTEGER NOT NULL REFERENCES revisions(version),owner_epoch TEXT NOT NULL);
      CREATE TABLE outcomes(operation_id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,result TEXT NOT NULL,version INTEGER NOT NULL REFERENCES revisions(version));
      CREATE TABLE pins(version INTEGER PRIMARY KEY REFERENCES revisions(version));
      CREATE TABLE blobs(hash TEXT PRIMARY KEY,bytes BLOB NOT NULL);
      CREATE TABLE recovery(context_id TEXT PRIMARY KEY,generation INTEGER NOT NULL,base_version INTEGER NOT NULL REFERENCES revisions(version),owner_epoch TEXT NOT NULL,payload ${model.storageType ?? 'TEXT'},hash TEXT,active INTEGER NOT NULL);
      PRAGMA user_version=${model.schemaVersion ?? 1};`);
        const initialization = model.initialize?.(db, this);
        const s = this.encode(model.initial(initialization));
        db.prepare('INSERT INTO revisions VALUES(0,NULL,?,?,NULL)').run(
          s,
          hash(s)
        );
        db.prepare('INSERT INTO meta VALUES(1,?,?,0,?)').run(
          randomUUID(),
          randomUUID(),
          randomUUID()
        );
        db.exec('COMMIT');
        sync(dir);
      }
      this.check();
      this.epoch = randomUUID();
      db.prepare('UPDATE meta SET owner_epoch=? WHERE singleton=1').run(
        this.epoch
      );
      this.meta = this.getMeta();
    } catch (e) {
      this.db.close();
      if (/locked|busy/i.test(e.message)) throw Error('OWNER_BUSY');
      throw e;
    }
  }
  getMeta() {
    return this.db.prepare('SELECT * FROM meta WHERE singleton=1').get();
  }
  root(v) {
    const r = this.db.prepare('SELECT * FROM revisions WHERE version=?').get(v);
    if (!r) throw Error('VERSION_NOT_FOUND');
    return { ...r, state: this.decode(r.state) };
  }
  checkState(s) {
    this.model.validateState(s);
    for (const a of s.attachments) {
      const b = this.db
        .prepare('SELECT bytes FROM blobs WHERE hash=?')
        .get(a.blobHash);
      if (!b || hash(b.bytes) !== a.blobHash)
        throw Error('BROKEN_BLOB_CLOSURE');
    }
    this.model.checkExternalState?.(s, this);
  }
  check() {
    const db = this.db;
    if (
      db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length
    )
      throw Error('BROKEN_SQL_CLOSURE');
    const m = this.getMeta();
    const rows = db.prepare('SELECT * FROM revisions ORDER BY version').all();
    if (!m || !rows.length || m.current_version !== rows.length - 1)
      throw Error('BROKEN_CURRENT_ROOT');
    rows.forEach((r, i) => {
      if (
        r.version !== i ||
        r.parent !== (i ? i - 1 : null) ||
        hash(r.state) !== r.hash
      )
        throw Error('BROKEN_REVISION');
      this.checkState(this.decode(r.state));
      if (i) {
        const o = db
          .prepare('SELECT * FROM outcomes WHERE operation_id=?')
          .get(r.operation_id);
        if (!o || o.version !== i || JSON.parse(o.result).status !== 'applied')
          throw Error('BROKEN_RECEIPT_CLOSURE');
      }
    });
    for (const o of db.prepare('SELECT * FROM outcomes').all()) {
      const r = JSON.parse(o.result);
      if (
        r.status === 'applied' &&
        rows[o.version]?.operation_id !== o.operation_id
      )
        throw Error('BROKEN_OUTCOME_REVISION');
      if (
        r.operationId !== o.operation_id ||
        r.version !== o.version ||
        r.spaceId !== m.space_id ||
        r.documentId !== m.document_id ||
        !['applied', 'protected', 'recorded'].includes(r.status) ||
        !/^[a-f0-9]{64}$/.test(o.request_hash)
      )
        throw Error('BROKEN_OUTCOME');
    }
    for (const r of db.prepare('SELECT * FROM recovery').all()) {
      if (
        !Number.isSafeInteger(r.generation) ||
        r.generation < 0 ||
        ![0, 1].includes(r.active)
      )
        throw Error('BROKEN_RECOVERY');
      if (r.active) {
        if (hash(r.payload ?? '') !== r.hash) throw Error('BROKEN_RECOVERY');
        this.checkState(this.decode(r.payload));
      } else if (r.payload !== null || r.hash !== null)
        throw Error('BROKEN_RECOVERY');
    }
    this.model.checkClosure?.(this);
  }
  async execute(c, grant) {
    if (this.failed) throw Error('OWNER_UNAVAILABLE_RECONNECT');
    this.model.validateCommand(c);
    this.model.authorize?.(c, grant);
    const db = this.db,
      m = this.getMeta();
    if (c.spaceId !== m.space_id || c.documentId !== m.document_id)
      throw Error('WRONG_DESTINATION');
    if (c.method === 'read')
      return {
        ...(this.model.readMeta?.(this) ?? {}),
        spaceId: m.space_id,
        documentId: m.document_id,
        version: m.current_version,
        ownerEpoch: this.epoch,
        state: this.root(m.current_version).state,
      };
    if (c.method === 'read_version')
      return {
        version: c.version,
        state: this.root(c.version).state,
        pinned: !!db
          .prepare('SELECT 1 FROM pins WHERE version=?')
          .get(c.version),
      };
    if (this.model.readMethods?.includes(c.method))
      return this.model.read(c, this);
    if (c.method === 'outcome') {
      const result = this.outcome(c.operationId);
      if (this.uncertainOperation === c.operationId) {
        this.check();
        this.uncertainOperation = null;
      }
      return result;
    }
    if (c.method === 'list_recovery')
      return db
        .prepare('SELECT * FROM recovery WHERE active=1')
        .all()
        .map((r) => ({
          ...r,
          state: this.decode(r.payload),
          payload: undefined,
          liveOwned: this.recoveryLive(r),
        }));
    if (!this.model.mutations.includes(c.method)) throw Error('UNKNOWN_METHOD');
    if (this.uncertainOperation) throw Error('COMMIT_OUTCOME_UNRESOLVED');
    const fingerprint = hash(stable(c)),
      prior = db
        .prepare('SELECT * FROM outcomes WHERE operation_id=?')
        .get(c.operationId);
    if (prior) {
      if (prior.request_hash !== fingerprint)
        throw Error('OPERATION_ID_REUSED');
      return JSON.parse(prior.result);
    }
    if (
      c.expectedVersion !== undefined &&
      c.expectedVersion !== m.current_version
    )
      throw Error('REVISION_CONFLICT');
    let version = m.current_version,
      status = 'recorded',
      state,
      blob,
      recovery,
      commitData;
    if (
      (
        this.model.reduceMethods ?? [
          'insert',
          'task_update',
          'remove_attachment',
        ]
      ).includes(c.method)
    ) {
      if (this.model.stage) {
        const staged = await this.model.stage(
          this.root(version).state,
          c,
          this
        );
        state = staged.state;
        commitData = staged.commitData;
      } else state = await this.model.reduce(this.root(version).state, c, this);
    }
    if (c.method === 'attach') {
      if (
        typeof c.base64 !== 'string' ||
        c.base64.length > 350000 ||
        typeof c.name !== 'string' ||
        typeof c.mime !== 'string'
      )
        throw Error('INVALID_ATTACHMENT');
      blob = Buffer.from(c.base64, 'base64');
      if (!blob.length || blob.toString('base64') !== c.base64)
        throw Error('INVALID_ATTACHMENT');
      state = this.root(version).state;
      if (state.attachments.some((a) => a.id === c.attachmentId))
        throw Error('DUPLICATE_ATTACHMENT');
      state.attachments.push({
        id: c.attachmentId,
        blobHash: hash(blob),
        name: c.name,
        mime: c.mime,
      });
      this.model.validateState(state);
    }
    if (c.method === 'restore_version') state = this.root(c.version).state;
    if (c.method === 'pin_version') this.root(c.version);
    if (c.method === 'protect') {
      this.root(c.baseVersion);
      this.checkState(c.state);
      this.model.validateProtection?.(c.state, this.root(c.baseVersion).state);
      recovery = db
        .prepare('SELECT * FROM recovery WHERE context_id=?')
        .get(c.contextId);
      if (recovery && c.generation <= recovery.generation)
        throw Error('STALE_RECOVERY_GENERATION');
      status = 'protected';
    }
    if (c.method === 'restore_protection') {
      recovery = db
        .prepare('SELECT * FROM recovery WHERE context_id=? AND active=1')
        .get(c.contextId);
      if (!recovery || recovery.generation !== c.generation)
        throw Error('RECOVERY_NOT_FOUND');
      if (this.recoveryLive(recovery)) throw Error('RECOVERY_LIVE_OWNED');
      if (recovery.base_version !== version) throw Error('RECOVERY_CONFLICT');
      state = this.decode(recovery.payload);
    }
    if (
      state &&
      this.model.deduplicateState &&
      hash(this.encode(state)) === this.root(version).hash
    )
      state = undefined;
    if (state) {
      this.checkStateExceptNewBlob(state, blob);
      status = 'applied';
      version++;
    }
    const result = {
      status,
      ...(this.model.resultMeta?.(c) ?? {}),
      durability: status === 'protected' ? 'durable_recovery' : 'durable',
      operationId: c.operationId,
      spaceId: m.space_id,
      documentId: m.document_id,
      version,
    };
    await this.phase('before_begin', c);
    if (
      (this.failWrites && state) ||
      (c.method === 'protect' && this.failProtection)
    )
      throw Error('INJECTED_SAVE_FAILURE');
    try {
      await atomic(
        db,
        async () => {
          if (blob)
            db.prepare('INSERT OR IGNORE INTO blobs VALUES(?,?)').run(
              hash(blob),
              blob
            );
          if (state) {
            const json = this.encode(state);
            db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(
              version,
              m.current_version,
              json,
              hash(json),
              c.operationId
            );
            db.prepare(
              'UPDATE meta SET current_version=? WHERE singleton=1'
            ).run(version);
            await this.phase('after_revision', c);
          }
          if (c.method === 'pin_version')
            db.prepare('INSERT OR IGNORE INTO pins VALUES(?)').run(c.version);
          if (c.method === 'protect') {
            const json = this.encode(c.state);
            db.prepare(
              'INSERT INTO recovery VALUES(?,?,?,?,?,?,1) ON CONFLICT(context_id) DO UPDATE SET generation=excluded.generation,base_version=excluded.base_version,owner_epoch=excluded.owner_epoch,payload=excluded.payload,hash=excluded.hash,active=1'
            ).run(
              c.contextId,
              c.generation,
              c.baseVersion,
              this.epoch,
              json,
              hash(json)
            );
            await this.phase('after_protection', c);
          }
          if (c.method === 'release_protection')
            db.prepare(
              'UPDATE recovery SET active=0,payload=NULL,hash=NULL WHERE context_id=? AND owner_epoch=? AND generation<=?'
            ).run(c.contextId, c.ownerEpoch, c.throughGeneration);
          if (c.method === 'restore_protection')
            db.prepare(
              'UPDATE recovery SET active=0,payload=NULL,hash=NULL WHERE context_id=?'
            ).run(c.contextId);
          await this.model.applyMetadata?.(c, this, {
            state,
            version,
            result,
            commitData,
          });
          db.prepare('INSERT INTO outcomes VALUES(?,?,?,?)').run(
            c.operationId,
            fingerprint,
            stable(result),
            version
          );
          await this.phase('after_outcome', c);
          await this.phase('before_commit', c);
        },
        () => this.phase('after_commit', c)
      );
      if (this.loseCommitReturn) {
        this.loseCommitReturn = false;
        this.uncertainOperation = c.operationId;
        return {
          status: 'uncertain',
          operationId: c.operationId,
          outcomeRef: {
            spaceId: m.space_id,
            documentId: m.document_id,
            operationId: c.operationId,
          },
          reason: 'INJECTED_LOST_COMMIT_RETURN',
        };
      }
      return result;
    } catch (e) {
      if (e instanceof CommitUnknown) {
        if (e.rollbackFailed) this.failed = true;
        this.uncertainOperation = c.operationId;
        return {
          status: 'uncertain',
          operationId: c.operationId,
          outcomeRef: {
            spaceId: m.space_id,
            documentId: m.document_id,
            operationId: c.operationId,
          },
          reason: e.cause?.message ?? e.message,
        };
      }
      throw e;
    }
  }
  checkStateExceptNewBlob(s, blob) {
    this.model.validateState(s);
    const h = blob && hash(blob);
    this.checkState({
      ...s,
      attachments: s.attachments.filter((a) => a.blobHash !== h),
    });
  }
  recoveryLive(r) {
    return (
      this.model.isRecoveryLiveOwned?.(r, this) ?? r.owner_epoch === this.epoch
    );
  }
  outcome(id) {
    const r = this.db
      .prepare('SELECT result FROM outcomes WHERE operation_id=?')
      .get(id);
    return r ? JSON.parse(r.result) : null;
  }
  close() {
    this.db.close();
  }
}
