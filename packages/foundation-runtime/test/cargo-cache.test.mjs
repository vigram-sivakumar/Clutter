import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLockedCargo } from '../../../apps/foundation-desktop/tools/cargo-cache.mjs';
test('Cargo acquisition uses offline first and at most one locked online attempt; failure has no unlocked/version fallback', () => {
  const calls = [];
  const invoke = (_c, args, options) => {
    calls.push({ args, options });
    return { status: calls.length === 1 ? 101 : 0 };
  };
  assert.equal(
    fetchLockedCargo('cargo', 'project/Cargo.toml', invoke),
    'locked-network-acquisition'
  );
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert(c.args.includes('--locked'));
    assert(!c.args.includes('update'));
  }
  assert(calls[0].args.includes('--offline'));
  assert(!calls[1].args.includes('--offline'));
  assert.equal(calls[1].options.online, true);
  let count = 0;
  assert.equal(
    fetchLockedCargo('cargo', 'manifest', () => {
      count++;
      return { status: 0 };
    }),
    'private-cache'
  );
  assert.equal(count, 1);
  count = 0;
  assert.throws(
    () =>
      fetchLockedCargo('cargo', 'manifest', () => {
        count++;
        return { status: 101 };
      }),
    /NO_VERSION_FALLBACK/
  );
  assert.equal(count, 2);
});
