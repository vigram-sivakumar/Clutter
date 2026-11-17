import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, cpSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLockedTools, nativeLockSource } from '../../../apps/foundation-desktop/tools/locks.mjs';

const mapping = [
  ['native-tools.package.json', 'package.json'],
  ['native-tools.package-lock.json', 'package-lock.json'],
  ['Cargo.toml', 'src-tauri/Cargo.toml'],
  ['Cargo.lock', 'src-tauri/Cargo.lock'],
];
test('native setup works with only checked-in dependency inputs in a relocated folder with spaces', () => {
  const base = mkdtempSync(join(tmpdir(), 'clutter native52 '));
  try {
    const source = join(base, 'Clutter Structured/dependency inputs');
    cpSync(nativeLockSource, source, { recursive: true });
    const project = join(base, 'fresh project');
    const result = prepareLockedTools(project, source);
    for (const [input, output] of mapping)
      assert.deepEqual(readFileSync(join(project, output)), readFileSync(join(nativeLockSource, input)));
    assert.equal(result.source, 'checked-in-native-locks');
    assert.equal(result.cargoSha256, 'dcd4eb2ea8622d6bdefe0c31c4a0148518325b4728e83c0a48eede1110d7e8f4');
    assert.equal(result.npmSha256, '2c3314e3cc3fabb27e8a4a3f08ce874c2f3ef76898e88b826459cc7dcdf97522');
    assert.deepEqual(readFileSync(new URL('../../../apps/foundation-desktop/src-tauri/Cargo.toml', import.meta.url)), readFileSync(join(source, 'Cargo.toml')));
    assert(!existsSync(join(base, 'clutter-host-qualification')));
  } finally { rmSync(base, { recursive: true, force: true }); }
});
test('corruption of any manifest or lock refuses setup before writing generated project files', () => {
  const base = mkdtempSync(join(tmpdir(), 'clutter-lock52-'));
  try {
    for (const [input] of mapping) {
      const source = join(base, input.replaceAll('.', '_'));
      cpSync(nativeLockSource, source, { recursive: true });
      writeFileSync(join(source, input), 'damaged');
      const project = join(source, 'generated');
      assert.throws(() => prepareLockedTools(project, source), /DEPENDENCY_LOCK_INTEGRITY/);
      assert(!existsSync(project));
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});
test('active native runner and build do not read previous experiment/cache paths', () => {
  for (const file of ['run.mjs', 'tools/build.mjs', 'tools/locks.mjs', 'tools/cargo-cache.mjs']) {
    const source = readFileSync(new URL('../../../apps/foundation-desktop/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /clutter-host-qualification|clutter-native28|tauri-project|prepareCargoCache/);
  }
});
