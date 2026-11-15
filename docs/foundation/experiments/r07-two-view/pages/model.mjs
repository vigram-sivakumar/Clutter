// The Space service uses this persistence profile; business rules stay shared.
import * as entity from '../entities/model.mjs';
import * as media from '../media/model.mjs';
import * as engine from './codec.mjs';
import { paragraph, document, slot } from '../entities/schema.mjs';
import { stable, hash } from '../durable/model.mjs';
import { publish, readObject } from '../media/files.mjs';
export const marker = 'CLUTTER-PAGE-ROOT-PROOF-1\n',
  schemaVersion = 5;
const format = 'space-page-commit-v1',
  id = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
const exact = (o, keys) => {
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).sort().join() !== [...keys].sort().join()
  )
    throw Error('INVALID_PAGE_COMMAND');
};
export const encode = stable,
  decode = JSON.parse;
const metrics = (store) => (store.pageMetrics ??= { encoded: [], decoded: [] });
export function validateState(s) {
  exact(s, ['format', 'changes', 'attachments']);
  if (
    s.format !== format ||
    !Array.isArray(s.changes) ||
    !Array.isArray(s.attachments) ||
    s.attachments.length
  )
    throw Error('INVALID_COMMIT_DESCRIPTOR');
  const seen = new Set();
  for (const row of s.changes) {
    exact(row, ['pageId', 'kind', 'hash']);
    if (
      !id(row.pageId) ||
      !['notes', 'tasks'].includes(row.kind) ||
      !/^[a-f0-9]{64}$/.test(row.hash) ||
      seen.has(row.pageId)
    )
      throw Error('INVALID_COMMIT_DESCRIPTOR');
    seen.add(row.pageId);
  }
}
const descriptor = (rows) => ({
  format,
  changes: rows.map(({ pageId, kind, hash }) => ({ pageId, kind, hash })),
  attachments: [],
});
const kindOf = (store, pageId) =>
  store.db.prepare('SELECT kind FROM page_catalog WHERE page_id=?').get(pageId)
    ?.kind;
function head(store, pageId, version) {
  return store.db
    .prepare(
      'SELECT root_hash FROM page_changes WHERE page_id=? AND version<=? ORDER BY version DESC LIMIT 1'
    )
    .get(pageId, version)?.root_hash;
}
function load(store, pageId, version) {
  const rootHash = head(store, pageId, version);
  if (!rootHash) throw Error('PAGE_NOT_FOUND');
  const row = store.db
    .prepare('SELECT * FROM page_roots WHERE root_hash=?')
    .get(rootHash);
  if (!row || row.page_id !== pageId || kindOf(store, pageId) !== row.kind)
    throw Error('BROKEN_PAGE_REFERENCE');
  const d = engine.decode(row, metrics(store));
  try {
    return {
      pageId,
      kind: row.kind,
      rootHash,
      page: engine.projection(d, row.kind),
      row,
    };
  } finally {
    d.destroy();
  }
}
const assetMeta = (store, digest) => {
  const r = store.db
    .prepare('SELECT bytes,mime FROM file_catalog WHERE hash=?')
    .get(digest);
  if (!r) throw Error('MISSING_ASSET_METADATA');
  return { bytes: r.bytes, mime: r.mime };
};
function validatePageData(store, pageId, kind, page, extraAssets = {}) {
  const info = entity.validatePage(kind, engine.entityProjection(page, kind), {
    hasTask: (id) => kindOf(store, id) === 'tasks',
  });
  const links = Object.fromEntries(
    Object.entries(page.links).map(([id, l]) => [id, { ...l, pageId }])
  );
  for (const l of Object.values(page.links)) exact(l, ['hash', 'name', 'role']);
  const assets = Object.fromEntries(
    Object.values(page.links).map((l) => [
      l.hash,
      extraAssets[l.hash] ?? assetMeta(store, l.hash),
    ])
  );
  media.validateAssociations({
    notes: kind === 'notes' ? { [pageId]: {} } : {},
    tasks: kind === 'tasks' ? { [pageId]: {} } : {},
    assets,
    assetLinks: links,
  });
  for (const [digest, meta] of Object.entries(assets))
    readObject(store, digest, meta);
  return info;
}
function insertPayloads(store, rows, version) {
  const db = store.db;
  for (const row of rows) {
    db.prepare('INSERT OR IGNORE INTO page_roots VALUES(?,?,?,?)').run(
      row.hash,
      row.pageId,
      row.kind,
      row.bytes
    );
    db.prepare('INSERT INTO page_changes VALUES(?,?,?)').run(
      version,
      row.pageId,
      row.hash
    );
  }
}
function insertIndexes(store, rows) {
  const db = store.db;
  for (const row of rows) {
    db.prepare('DELETE FROM placement_current WHERE page_id=?').run(row.pageId);
    db.prepare('DELETE FROM block_current WHERE page_id=?').run(row.pageId);
    db.prepare('DELETE FROM asset_refs_current WHERE page_id=?').run(
      row.pageId
    );
  }
  for (const row of rows) {
    const d = engine.decode(row, metrics(store));
    let page;
    try {
      page = engine.projection(d, row.kind);
    } finally {
      d.destroy();
    }
    const info = validatePageData(store, row.pageId, row.kind, page);
    for (const blockId of info.blockIds)
      db.prepare('INSERT INTO block_current VALUES(?,?)').run(
        blockId,
        row.pageId
      );
    for (const slot of info.slots)
      db.prepare('INSERT INTO placement_current VALUES(?,?,?)').run(
        slot.taskId,
        row.pageId,
        slot.blockId
      );
    for (const [attachmentId, l] of Object.entries(page.links))
      db.prepare('INSERT INTO asset_refs_current VALUES(?,?,?,?)').run(
        attachmentId,
        row.pageId,
        l.hash,
        l.role
      );
  }
}
function insertHeads(store, rows) {
  for (const row of rows)
    store.db
      .prepare(
        'INSERT INTO page_heads VALUES(?,?) ON CONFLICT(page_id) DO UPDATE SET root_hash=excluded.root_hash'
      )
      .run(row.pageId, row.hash);
}
export function initialize(db, store) {
  db.exec(`CREATE TABLE page_catalog(page_id TEXT PRIMARY KEY,kind TEXT NOT NULL);
    CREATE TABLE page_roots(root_hash TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES page_catalog(page_id),kind TEXT NOT NULL,payload BLOB NOT NULL);
    CREATE TABLE page_heads(page_id TEXT PRIMARY KEY REFERENCES page_catalog(page_id),root_hash TEXT NOT NULL REFERENCES page_roots(root_hash));
    CREATE TABLE page_changes(version INTEGER NOT NULL REFERENCES revisions(version) DEFERRABLE INITIALLY DEFERRED,page_id TEXT NOT NULL REFERENCES page_catalog(page_id),root_hash TEXT NOT NULL REFERENCES page_roots(root_hash),PRIMARY KEY(version,page_id));
    CREATE INDEX page_asof ON page_changes(page_id,version DESC);
    CREATE TABLE placement_current(task_id TEXT PRIMARY KEY REFERENCES page_catalog(page_id),page_id TEXT NOT NULL REFERENCES page_catalog(page_id),slot_id TEXT UNIQUE NOT NULL);
    CREATE TABLE block_current(block_id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES page_catalog(page_id));
    CREATE TABLE file_catalog(hash TEXT PRIMARY KEY,bytes INTEGER NOT NULL,mime TEXT NOT NULL);
    CREATE TABLE asset_refs_current(attachment_id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES page_catalog(page_id),hash TEXT NOT NULL REFERENCES file_catalog(hash),role TEXT NOT NULL);
    CREATE TABLE snapshots(snapshot_id TEXT PRIMARY KEY,page_id TEXT NOT NULL REFERENCES page_catalog(page_id),version INTEGER NOT NULL REFERENCES revisions(version),kind TEXT NOT NULL);
    CREATE TABLE retained_roots(snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,page_id TEXT NOT NULL REFERENCES page_catalog(page_id),root_hash TEXT NOT NULL REFERENCES page_roots(root_hash),PRIMARY KEY(snapshot_id,page_id));
    CREATE TABLE retained_files(snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) ON DELETE CASCADE,hash TEXT NOT NULL REFERENCES file_catalog(hash),PRIMARY KEY(snapshot_id,hash));`);
  const s = entity.initial();
  s.notes.n3 = {
    title: 'Unrelated note',
    body: document(paragraph('n3-p1', 'Unchanged third note'), slot('t2')),
  };
  s.tasks.t2 = {
    title: 'Second task',
    body: document(paragraph('t2-p1', 'Second task details')),
    properties: {},
  };
  const rows = [];
  for (const kind of ['notes', 'tasks'])
    for (const [pageId, p] of Object.entries(s[kind]))
      db.prepare('INSERT INTO page_catalog VALUES(?,?)').run(pageId, kind);
  for (const kind of ['notes', 'tasks'])
    for (const [pageId, p] of Object.entries(s[kind])) {
      const d = engine.fresh(kind, {
        ...p,
        properties: p.properties ?? {
          Category: { type: 'text', value: 'Planning' },
        },
      });
      try {
        rows.push(engine.encode(d, pageId, kind, metrics(store)));
      } finally {
        d.destroy();
      }
    }
  insertPayloads(store, rows, 0);
  insertIndexes(store, rows);
  insertHeads(store, rows);
  return descriptor(rows);
}
export const initial = (initialization) => initialization;
const entityMethods = new Set(entity.reduceMethods),
  mediaMethods = new Set(['import_asset', 'remove_asset']);
const queries = {
  page_read: ['pageId', 'version'],
  page_current: ['pageId'],
  page_asset: ['pageId', 'attachmentId', 'version'],
  heads: [],
  metrics: [],
  changes_since: ['version'],
  read_snapshot: ['snapshotId'],
};
const metadata = {
  pin_snapshot: ['snapshotId', 'pageId', 'version'],
  lease_snapshot: ['snapshotId', 'pageId', 'version'],
  release_snapshot: ['snapshotId'],
};
export const reduceMethods = [...entityMethods, ...mediaMethods],
  mutations = [...reduceMethods, ...Object.keys(metadata)],
  readMethods = Object.keys(queries);
export function validateCommand(c) {
  if (entityMethods.has(c?.method) || mediaMethods.has(c?.method)) {
    if (Object.hasOwn(c, 'expectedVersion')) throw Error('USE_EXPECTED_HEADS');
    if (
      !c.expectedHeads ||
      typeof c.expectedHeads !== 'object' ||
      Array.isArray(c.expectedHeads) ||
      !Object.keys(c.expectedHeads).length
    )
      throw Error('EXPECTED_HEADS_REQUIRED');
    for (const [pageId, h] of Object.entries(c.expectedHeads))
      if (!id(pageId) || typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))
        throw Error('INVALID_EXPECTED_HEAD');
    const { expectedHeads, ...rest } = c;
    media.validateCommand({ ...rest, expectedVersion: 0 });
    return;
  }
  const fields = queries[c?.method] ?? metadata[c?.method];
  if (fields) {
    exact(c, [
      'method',
      'spaceId',
      'documentId',
      ...(metadata[c.method] ? ['operationId'] : []),
      ...fields,
    ]);
    for (const k of [
      'spaceId',
      'documentId',
      'operationId',
      'pageId',
      'snapshotId',
      'attachmentId',
    ])
      if (c[k] !== undefined && !id(c[k])) throw Error('INVALID_ID');
    if (
      c.version !== undefined &&
      (!Number.isSafeInteger(c.version) || c.version < 0)
    )
      throw Error('INVALID_VERSION');
    return;
  }
  if (!['read', 'read_version', 'outcome'].includes(c?.method))
    throw Error('UNSUPPORTED_PAGE_COMMAND');
  return entity.validateCommand(c);
}
// Derive the mutation schemas from the SAME validated aggregate catalogue.
export const commandSchema = {
  type: 'object',
  oneOf: [
    ...media.commandSchema.oneOf
      .filter((s) => reduceMethods.includes(s.properties.method.const))
      .map((s) => {
        const copy = structuredClone(s);
        copy.required = copy.required.filter((k) => k !== 'expectedVersion');
        delete copy.properties.expectedVersion;
        copy.required.push('expectedHeads');
        copy.properties.expectedHeads = {
          type: 'object',
          additionalProperties: { type: 'string' },
        };
        return copy;
      }),
    ...Object.entries({ ...queries, ...metadata }).map(([method, list]) => {
      const fields = [
        'method',
        'spaceId',
        'documentId',
        ...(metadata[method] ? ['operationId'] : []),
        ...list,
      ];
      return {
        type: 'object',
        required: fields,
        additionalProperties: false,
        properties: Object.fromEntries(
          fields.map((k) => [
            k,
            k === 'method'
              ? { const: method }
              : k === 'version'
                ? { type: 'integer', minimum: 0 }
                : { type: 'string' },
          ])
        ),
      };
    }),
    ...entity.commandSchema.oneOf.filter((s) =>
      ['read', 'read_version', 'outcome'].includes(s.properties.method.const)
    ),
  ],
};
function guardHeads(c, store, required = []) {
  for (const id of required)
    if (!Object.hasOwn(c.expectedHeads, id))
      throw Error('EXPECTED_HEADS_REQUIRED');
  for (const [pageId, h] of Object.entries(c.expectedHeads))
    if (
      store.db
        .prepare('SELECT root_hash FROM page_heads WHERE page_id=?')
        .get(pageId)?.root_hash !== h
    )
      throw Error('PAGE_HEAD_CONFLICT');
}
export async function stage(_, c, store) {
  guardHeads(c, store);
  const version = store.getMeta().current_version,
    loaded = new Map(),
    rows = [],
    newAssets = {};
  const get = (pageId) => {
    if (!loaded.has(pageId)) loaded.set(pageId, load(store, pageId, version));
    return loaded.get(pageId);
  };
  const updates = new Map();
  if (entityMethods.has(c.method)) {
    const plan = entity.planEntity(c, {
      hasTask: (id) => kindOf(store, id) === 'tasks',
      placementOf: (id) => {
        const p = store.db
          .prepare(
            'SELECT page_id AS noteId,slot_id AS blockId FROM placement_current WHERE task_id=?'
          )
          .get(id);
        return p;
      },
      getNote: (id) =>
        kindOf(store, id) === 'notes'
          ? engine.entityProjection(get(id).page, 'notes')
          : undefined,
      historyNote: (id, v) => {
        store.root(v);
        return engine.entityProjection(load(store, id, v).page, 'notes');
      },
    });
    for (const kind of ['notes', 'tasks'])
      for (const [pageId, p] of Object.entries(plan[kind])) {
        const old = get(pageId);
        updates.set(pageId, { ...old.page, ...p });
      }
  } else {
    const reference = store.db
      .prepare('SELECT page_id FROM asset_refs_current WHERE attachment_id=?')
      .get(c.attachmentId);
    const pageId = c.method === 'import_asset' ? c.pageId : reference?.page_id;
    if (!pageId) throw Error('ATTACHMENT_NOT_FOUND');
    if (!kindOf(store, pageId)) throw Error('PAGE_NOT_FOUND');
    const page = structuredClone(get(pageId).page);
    if (c.method === 'import_asset') {
      media.admitImport(c, {
        hasPage: (id) => !!kindOf(store, id),
        hasAttachment: () => !!reference,
        pageLinks: Object.values(page.links),
      });
      guardHeads(c, store, [pageId]);
      const { digest, meta } = await publish(
        store,
        c,
        Buffer.from(c.base64, 'base64')
      );
      newAssets[digest] = meta;
      page.links[c.attachmentId] = { hash: digest, name: c.name, role: c.role };
    } else {
      if (!Object.hasOwn(page.links, c.attachmentId))
        throw Error('BROKEN_ASSET_INDEX');
      delete page.links[c.attachmentId];
    }
    updates.set(pageId, page);
  }
  guardHeads(c, store, [...updates.keys()]);
  for (const [pageId, page] of updates) {
    const old = get(pageId);
    validatePageData(store, pageId, old.kind, page, newAssets);
    const d = engine.decode(old.row, metrics(store));
    try {
      engine.apply(d, old.kind, page);
      const links = d.getMap('links');
      for (const id of [...links.keys()])
        if (!Object.hasOwn(page.links, id)) links.delete(id);
      for (const [id, l] of Object.entries(page.links)) links.set(id, l);
      rows.push(engine.encode(d, pageId, old.kind, metrics(store)));
    } finally {
      d.destroy();
    }
  }
  await store.phase('after_page_stage', c);
  return { state: descriptor(rows), commitData: { rows, newAssets } };
}
function view(store, pageId, version) {
  store.root(version);
  const root = load(store, pageId, version),
    taskPreviews = [];
  if (root.kind === 'notes')
    for (const b of root.page.body.content ?? [])
      if (b.type === 'task_slot') {
        const task = load(store, b.attrs.taskId, version);
        taskPreviews.push({
          taskId: task.pageId,
          rootHash: task.rootHash,
          page: task.page,
        });
      }
  return {
    pageId,
    kind: root.kind,
    rootHash: root.rootHash,
    spaceVersion: version,
    page: root.page,
    taskPreviews,
  };
}
function closure(store, pageId, version) {
  const pages = new Map(),
    files = new Set();
  const visit = (id) => {
    if (pages.has(id)) return;
    const r = load(store, id, version);
    pages.set(id, r.rootHash);
    for (const l of Object.values(r.page.links)) files.add(l.hash);
    if (r.kind === 'notes')
      for (const b of r.page.body.content ?? [])
        if (b.type === 'task_slot') visit(b.attrs.taskId);
  };
  visit(pageId);
  return { pages, files };
}
export async function applyMetadata(c, store, { commitData, version }) {
  const db = store.db;
  if (commitData) {
    guardHeads(
      c,
      store,
      commitData.rows.map((r) => r.pageId)
    );
    for (const [digest, meta] of Object.entries(commitData.newAssets)) {
      const prior = db
        .prepare('SELECT bytes,mime FROM file_catalog WHERE hash=?')
        .get(digest);
      if (prior && stable(prior) !== stable(meta))
        throw Error('ASSET_METADATA_CONFLICT');
      db.prepare('INSERT OR IGNORE INTO file_catalog VALUES(?,?,?)').run(
        digest,
        meta.bytes,
        meta.mime
      );
    }
    insertPayloads(store, commitData.rows, version);
    await store.phase('after_page_roots', c);
    insertIndexes(store, commitData.rows);
    await store.phase('after_page_indexes', c);
    insertHeads(store, commitData.rows);
    await store.phase('after_page_heads', c);
  }
  if (['pin_snapshot', 'lease_snapshot'].includes(c.method)) {
    store.root(c.version);
    const refs = closure(store, c.pageId, c.version);
    db.prepare('INSERT INTO snapshots VALUES(?,?,?,?)').run(
      c.snapshotId,
      c.pageId,
      c.version,
      c.method === 'pin_snapshot' ? 'pin' : 'lease'
    );
    for (const [pageId, h] of refs.pages)
      db.prepare('INSERT INTO retained_roots VALUES(?,?,?)').run(
        c.snapshotId,
        pageId,
        h
      );
    for (const digest of refs.files)
      db.prepare('INSERT INTO retained_files VALUES(?,?)').run(
        c.snapshotId,
        digest
      );
  }
  if (c.method === 'release_snapshot') {
    const s = db
      .prepare('SELECT kind FROM snapshots WHERE snapshot_id=?')
      .get(c.snapshotId);
    if (!s || s.kind !== 'lease') throw Error('LEASE_NOT_FOUND');
    db.prepare('DELETE FROM snapshots WHERE snapshot_id=?').run(c.snapshotId);
  }
}
export function read(c, store) {
  const version = store.getMeta().current_version,
    db = store.db;
  if (c.method === 'page_current') return view(store, c.pageId, version);
  if (c.method === 'page_read') return view(store, c.pageId, c.version);
  if (c.method === 'page_asset') {
    store.root(c.version);
    const p = load(store, c.pageId, c.version).page;
    if (!Object.hasOwn(p.links, c.attachmentId))
      throw Error('ATTACHMENT_NOT_FOUND');
    const link = p.links[c.attachmentId],
      meta = assetMeta(store, link.hash);
    return {
      ...link,
      ...meta,
      spaceVersion: c.version,
      base64: readObject(store, link.hash, meta).toString('base64'),
    };
  }
  if (c.method === 'heads')
    return {
      spaceVersion: version,
      heads: Object.fromEntries(
        db
          .prepare('SELECT page_id,root_hash FROM page_heads ORDER BY page_id')
          .all()
          .map((r) => [r.page_id, r.root_hash])
      ),
    };
  if (c.method === 'metrics')
    return {
      ...structuredClone(metrics(store)),
      rootRows: db.prepare('SELECT count(*) AS n FROM page_roots').get().n,
      transactionOpen: db.isTransaction,
    };
  if (c.method === 'changes_since') {
    store.root(c.version);
    return {
      throughVersion: version,
      batches: db
        .prepare(
          'SELECT version,state FROM revisions WHERE version>? ORDER BY version'
        )
        .all(c.version)
        .map((r) => ({ version: r.version, changes: decode(r.state).changes })),
    };
  }
  if (c.method === 'read_snapshot') {
    const s = db
      .prepare('SELECT * FROM snapshots WHERE snapshot_id=?')
      .get(c.snapshotId);
    if (!s) throw Error('SNAPSHOT_NOT_FOUND');
    return {
      ...view(store, s.page_id, s.version),
      leaseOrPin: s.kind,
      roots: db
        .prepare(
          'SELECT page_id,root_hash FROM retained_roots WHERE snapshot_id=? ORDER BY page_id'
        )
        .all(c.snapshotId),
      files: db
        .prepare('SELECT hash FROM retained_files WHERE snapshot_id=?')
        .all(c.snapshotId),
    };
  }
}
export function checkClosure(store) {
  const db = store.db,
    current = store.getMeta().current_version,
    all = { notes: {}, tasks: {} };
  for (const row of db.prepare('SELECT * FROM page_roots').all()) {
    const d = engine.decode(row, metrics(store));
    try {
      validatePageData(
        store,
        row.page_id,
        row.kind,
        engine.projection(d, row.kind)
      );
    } finally {
      d.destroy();
    }
  }
  const blocks = [],
    placements = [],
    links = [];
  for (const { page_id, kind } of db
    .prepare('SELECT * FROM page_catalog ORDER BY page_id')
    .all()) {
    const p = load(store, page_id, current);
    if (
      p.rootHash !==
      db
        .prepare('SELECT root_hash FROM page_heads WHERE page_id=?')
        .get(page_id)?.root_hash
    )
      throw Error('BROKEN_PAGE_HEAD');
    all[kind][page_id] = engine.entityProjection(p.page, kind);
    const info = validatePageData(store, page_id, kind, p.page);
    for (const block_id of info.blockIds) blocks.push({ block_id, page_id });
    for (const s of info.slots)
      placements.push({ task_id: s.taskId, page_id, slot_id: s.blockId });
    for (const [attachment_id, l] of Object.entries(p.page.links))
      links.push({ attachment_id, page_id, hash: l.hash, role: l.role });
  }
  entity.validateProjection(all);
  const ordered = (a) =>
    stable(
      a
        .map((x) => ({ ...x }))
        .sort((a, b) => stable(a).localeCompare(stable(b)))
    );
  if (
    ordered(blocks) !==
      ordered(db.prepare('SELECT * FROM block_current').all()) ||
    ordered(placements) !==
      ordered(db.prepare('SELECT * FROM placement_current').all()) ||
    ordered(links) !==
      ordered(db.prepare('SELECT * FROM asset_refs_current').all())
  )
    throw Error('BROKEN_DERIVED_INDEX');
  for (const r of db
    .prepare('SELECT version,state FROM revisions ORDER BY version')
    .all())
    for (const c of decode(r.state).changes) {
      const row = db
        .prepare(
          'SELECT root_hash FROM page_changes WHERE version=? AND page_id=?'
        )
        .get(r.version, c.pageId);
      if (row?.root_hash !== c.hash) throw Error('BROKEN_CHANGESET');
    }
  for (const s of db.prepare('SELECT * FROM snapshots').all()) {
    const refs = closure(store, s.page_id, s.version);
    const roots = Object.fromEntries(
      db
        .prepare(
          'SELECT page_id,root_hash FROM retained_roots WHERE snapshot_id=?'
        )
        .all(s.snapshot_id)
        .map((r) => [r.page_id, r.root_hash])
    );
    if (stable(roots) !== stable(Object.fromEntries(refs.pages)))
      throw Error('BROKEN_PIN_CLOSURE');
    const files = db
      .prepare(
        'SELECT hash FROM retained_files WHERE snapshot_id=? ORDER BY hash'
      )
      .all(s.snapshot_id)
      .map((r) => r.hash);
    if (stable(files) !== stable([...refs.files].sort()))
      throw Error('BROKEN_PIN_CLOSURE');
  }
}
