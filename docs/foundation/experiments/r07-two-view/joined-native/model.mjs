// Native fixture adds explicit context handoff, never fake owner epochs.
import * as base from '../joined/codec.mjs';
export * from '../joined/codec.mjs';
export const marker = 'CLUTTER-R08-JOINED-NATIVE-CONTEXT-2\n';
export const schemaVersion = 2;
export const mutations = [...base.mutations, 'release_context'];
export function initialize(db) {
  db.exec(
    'CREATE TABLE context_releases(context_id TEXT PRIMARY KEY,generation INTEGER NOT NULL,owner_epoch TEXT NOT NULL)'
  );
}
export function validateCommand(c) {
  if (c?.method !== 'release_context') return base.validateCommand(c);
  const keys = [
    'method',
    'spaceId',
    'documentId',
    'operationId',
    'contextId',
    'generation',
  ];
  if (
    Object.keys(c).some((k) => !keys.includes(k)) ||
    keys.some((k) => c[k] === undefined) ||
    keys
      .filter((k) => k !== 'generation')
      .some((k) => typeof c[k] !== 'string' || !c[k] || c[k].length > 160) ||
    !Number.isSafeInteger(c.generation) ||
    c.generation < 1
  )
    throw Error('INVALID_CONTEXT_RELEASE');
}
export function authorize(c, grant) {
  if (c.method === 'release_context') {
    if (c.contextId !== grant?.contextId) throw Error('CONTEXT_GRANT_REQUIRED');
  } else base.authorize(c, grant);
}
export function applyMetadata(c, store) {
  if (c.method !== 'release_context') return;
  const r = store.db
    .prepare('SELECT * FROM recovery WHERE context_id=? AND active=1')
    .get(c.contextId);
  if (!r || r.generation !== c.generation || r.owner_epoch !== store.epoch)
    throw Error('CONTEXT_PROTECTION_REQUIRED');
  store.db
    .prepare(
      'INSERT INTO context_releases VALUES(?,?,?) ON CONFLICT(context_id) DO UPDATE SET generation=excluded.generation,owner_epoch=excluded.owner_epoch'
    )
    .run(c.contextId, c.generation, store.epoch);
}
export function isRecoveryLiveOwned(r, store) {
  if (r.owner_epoch !== store.epoch) return false;
  const release = store.db
    .prepare('SELECT * FROM context_releases WHERE context_id=?')
    .get(r.context_id);
  return !(
    release &&
    release.owner_epoch === r.owner_epoch &&
    release.generation >= r.generation
  );
}
export function readMeta(store) {
  return {
    ...base.readMeta(store),
    recoveryHeads: store.db
      .prepare('SELECT context_id,generation FROM recovery')
      .all(),
  };
}

export function checkClosure(store) {
  for (const lease of store.db
    .prepare('SELECT * FROM context_releases')
    .all()) {
    const r = store.db
      .prepare('SELECT * FROM recovery WHERE context_id=?')
      .get(lease.context_id);
    if (
      !r ||
      lease.generation > r.generation ||
      lease.generation < 1 ||
      typeof lease.owner_epoch !== 'string'
    )
      throw Error('BROKEN_CONTEXT_RELEASE');
  }
}
