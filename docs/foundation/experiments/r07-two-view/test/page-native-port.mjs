// Regression for the existing native context metadata callback, not a Mac test.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../durable/store.mjs';
import * as native from '../joined-native/model.mjs';
let store;
const results = [];
try {
  store = new Store(mkdtempSync(join(tmpdir(), 'page-native-port-')), {
    init: true,
    model: native,
  });
  const m = store.getMeta(),
    base = { spaceId: m.space_id, documentId: m.document_id },
    grant = { contextId: 'A' };
  const pending = native.reduce(
    store.root(0).state,
    { method: 'insert', target: 'Alpha', offset: 0, text: 'PENDING-CONTEXT ' },
    store
  );
  const protectedReceipt = await store.execute(
    {
      ...base,
      method: 'protect',
      operationId: 'protect-1',
      contextId: 'A',
      generation: 1,
      baseVersion: 0,
      state: pending,
    },
    grant
  );
  assert.equal(protectedReceipt.status, 'protected');
  const release = {
    ...base,
    method: 'release_context',
    operationId: 'release-1',
    contextId: 'A',
    generation: 1,
  };
  const receipt = await store.execute(release, grant);
  assert.equal(receipt.status, 'recorded');
  assert.deepEqual(await store.execute(release, grant), receipt);
  const list = await store.execute({ ...base, method: 'list_recovery' });
  assert.equal(list[0].liveOwned, false);
  const restored = await store.execute({
    ...base,
    method: 'restore_protection',
    operationId: 'restore-1',
    expectedVersion: 0,
    contextId: 'A',
    generation: 1,
  });
  assert.equal(restored.version, 1);
  assert.match(JSON.stringify(store.root(1).state.doc), /PENDING-CONTEXT/);
  store.check();
  results.push({
    status: 'pass',
    scope:
      'Old native-profile protect/release/restore metadata through shared Store; no macOS/AppKit/browser claim',
  });
  console.log('native metadata port pass');
} catch (e) {
  process.exitCode = 1;
  results.push({ status: 'fail', error: e.stack });
  console.error(e.stack);
} finally {
  store?.close();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/page24-native-port-results.json',
    JSON.stringify({ results }, null, 2) + '\n'
  );
}
