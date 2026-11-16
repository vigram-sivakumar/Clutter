import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  prepareCargoCache,
  fetchLockedCargo,
} from '../../../apps/foundation-desktop/tools/cargo-cache.mjs';
test('private Cargo cache seeds registry data only and preserves prior/new cache files', () => {
  const root = mkdtempSync(join(tmpdir(), 'clutter-cargo49-'));
  try {
    const prior = join(root, 'prior'),
      next = join(root, 'next');
    mkdirSync(join(prior, 'registry/cache'), { recursive: true });
    writeFileSync(join(prior, 'registry/cache/locked.crate'), 'archive');
    writeFileSync(join(prior, 'credentials.toml'), 'private');
    writeFileSync(join(prior, 'config.toml'), 'custom config');
    prepareCargoCache(next, prior);
    assert.equal(
      readFileSync(join(next, 'registry/cache/locked.crate'), 'utf8'),
      'archive'
    );
    assert.equal(existsSync(join(next, 'credentials.toml')), false);
    assert.equal(existsSync(join(next, 'config.toml')), false);
    writeFileSync(join(next, 'registry/cache/locked.crate'), 'retained');
    prepareCargoCache(next, prior);
    assert.equal(
      readFileSync(join(next, 'registry/cache/locked.crate'), 'utf8'),
      'retained'
    );
    assert.equal(
      readFileSync(join(prior, 'registry/cache/locked.crate'), 'utf8'),
      'archive'
    );
    const linked = join(root, 'linked');
    mkdirSync(linked);
    symlinkSync(join(prior, 'registry'), join(linked, 'registry'), 'dir');
    assert.throws(
      () => prepareCargoCache(join(root, 'bad'), linked),
      /UNSAFE_PRIOR_CARGO_REGISTRY/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
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
