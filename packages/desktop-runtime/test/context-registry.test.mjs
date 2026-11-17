import test from 'node:test';
import assert from 'node:assert/strict';
import { EditingContextRegistry } from '../../core/src/context-registry.ts';
const scope = { spaceId: 's', pageId: 'p', contextId: 'window_a' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function context() {
  return {
    safe: true,
    prepared: 0,
    destroyed: 0,
    async prepareClose() {
      this.prepared++;
      return this.safe;
    },
    destroy() {
      this.destroyed++;
    },
  };
}
test('concurrent view acquires open once and release is idempotent without destroying context', async () => {
  let opened = 0;
  const pending = deferred(),
    s = context(),
    r = new EditingContextRegistry(async () => {
      opened++;
      return pending.promise;
    });
  const a = r.acquire(scope),
    b = r.acquire(scope);
  await Promise.resolve();
  assert.equal(opened, 1);
  pending.resolve(s);
  const first = await a,
    second = await b;
  assert.equal(first.session, second.session);
  first.release();
  first.release();
  await assert.rejects(r.close(scope), /CONTEXT_IN_USE/);
  assert.equal(s.prepared, 0);
  second.release();
  assert.equal(s.destroyed, 0);
  const again = await r.acquire(scope);
  assert.equal(again.session, s);
  assert.equal(opened, 1);
  again.release();
  assert.equal(await r.close(scope), true);
  assert.equal(s.destroyed, 1);
});
test('space/page/context identity partitions sessions and caller mutation cannot change the retained key', async () => {
  const seen = [],
    r = new EditingContextRegistry(async (s) => {
      seen.push(s);
      return context();
    }),
    input = { ...scope };
  const a = r.acquire(input);
  input.pageId = 'other';
  const leases = await Promise.all([
    a,
    r.acquire({ ...scope, contextId: 'window_b' }),
    r.acquire({ ...scope, pageId: 'other' }),
    r.acquire({ ...scope, spaceId: 'other' }),
  ]);
  assert.equal(seen.length, 4);
  assert.equal(seen[0].pageId, 'p');
  assert(Object.isFrozen(seen[0]));
  for (const l of leases) l.release();
  for (const s of seen) await r.close(s);
});
test('catalogue validation rejects invalid identities before opening any session', async () => {
  let opened = 0;
  const r = new EditingContextRegistry(async () => {
    opened++;
    return context();
  });
  await assert.rejects(
    r.acquire({ ...scope, pageId: '../invalid' }),
    /INVALID_REQUEST/
  );
  assert.equal(opened, 0);
});
test('failed open releases reservation and allows a later independent retry', async () => {
  let opened = 0;
  const r = new EditingContextRegistry(async () => {
    if (++opened === 1) throw Error('open failure');
    return context();
  });
  await assert.rejects(r.acquire(scope), /open failure/);
  const lease = await r.acquire(scope);
  assert.equal(opened, 2);
  lease.release();
  assert.equal(await r.close(scope), true);
});
test('unsafe explicit close retains the same session for further views and retry', async () => {
  const s = context();
  s.safe = false;
  let opened = 0;
  const r = new EditingContextRegistry(async () => {
    opened++;
    return s;
  });
  const lease = await r.acquire(scope);
  lease.release();
  assert.equal(await r.close(scope), false);
  const again = await r.acquire(scope);
  assert.equal(again.session, s);
  assert.equal(opened, 1);
  assert.equal(s.destroyed, 0);
  again.release();
  s.safe = true;
  assert.equal(await r.close(scope), true);
  assert.equal(s.destroyed, 1);
});
test('close barrier blocks acquire and deduplicates concurrent teardown', async () => {
  const stop = deferred(),
    s = context();
  s.prepareClose = async () => {
    s.prepared++;
    return stop.promise;
  };
  const r = new EditingContextRegistry(async () => s),
    lease = await r.acquire(scope);
  lease.release();
  const a = r.close(scope),
    b = r.close(scope);
  await assert.rejects(r.acquire(scope), /CONTEXT_CLOSING/);
  assert.equal(s.prepared, 1);
  stop.resolve(true);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(s.destroyed, 1);
  assert.equal(await r.close(scope), true);
});
test('teardown error leaves the cached context intact and clears close barrier', async () => {
  const s = context();
  let fail = true;
  s.destroy = () => {
    if (fail) throw Error('context busy');
    s.destroyed++;
  };
  const r = new EditingContextRegistry(async () => s),
    lease = await r.acquire(scope);
  lease.release();
  await assert.rejects(r.close(scope), /context busy/);
  const again = await r.acquire(scope);
  assert.equal(again.session, s);
  again.release();
  fail = false;
  assert.equal(await r.close(scope), true);
});
