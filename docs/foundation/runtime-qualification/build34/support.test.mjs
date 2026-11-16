import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { bootstrap, decodeEvent } from './bootstrap.mjs';
import {
  checksumEntry,
  safeArchiveNames,
  tauriProject,
  tree,
  graphSourceHashes,
  sha,
  writeJson,
} from './projects.mjs';
const source = dirname(fileURLToPath(import.meta.url));
const ui = {
  url: 'http://127.0.0.1:23456',
  token: 'fixture-private-ui-token',
  spaceId: 'fixture-space',
  png: '',
  pngAlt: '',
  pdf: '',
};
function browser(origin = ui.url) {
  const events = [],
    status = { textContent: '' };
  const location = {
    origin,
    pathname: '/',
    set href(v) {
      events.push(v);
    },
  };
  const sandbox = { location, document: { querySelector: () => status } };
  vm.createContext(sandbox);
  vm.runInContext(bootstrap(ui, 'nonce'), sandbox);
  return { sandbox, events, status };
}
test('origin-bound shell bootstrap exposes only UI data and finite host events', () => {
  const b = browser();
  assert.equal(b.sandbox.__clutterCore28Bootstrap.token, ui.token);
  b.sandbox.__clutterHostEvent({
    action: 'ready',
    capture: { ignored: 'not sent' },
  });
  assert.deepEqual(decodeEvent(b.events[0], 'nonce'), {
    event: 'ready',
    bootNonce: 'nonce',
  });
  assert.ok(!b.events[0].includes(ui.token));
  assert.equal(b.sandbox.require, undefined);
  assert.equal(
    browser('https://wrong.invalid').sandbox.__clutterCore28Bootstrap,
    undefined
  );
  b.sandbox.__clutterHostEvent({ action: 'pdf', payload: 'not-exported' });
  assert.match(b.status.textContent, /not included/);
  assert.equal(decodeEvent(b.events[1], 'nonce').event, 'pdf-not-qualified');
});
test('close bridge calls shared prepareClose and carries challenge; failures stay unsafe', async () => {
  const b = browser();
  let called = 0;
  b.sandbox.lab28 = {
    prepareClose: async () => {
      called++;
      return { safe: true };
    },
  };
  await b.sandbox.__host34Close('guard1');
  assert.equal(called, 1);
  assert.deepEqual(decodeEvent(b.events[0], 'nonce'), {
    event: 'close',
    guardNonce: 'guard1',
    safe: true,
    bootNonce: 'nonce',
  });
  b.sandbox.lab28.prepareClose = async () => {
    throw Error('protection failed');
  };
  await b.sandbox.__host34Close('guard2');
  assert.equal(decodeEvent(b.events[1], 'nonce').safe, false);
});
test('host event decoder refuses another boot, scheme, or malformed close result', () => {
  const addr = (m) =>
    'clutter-host34://event/?m=' + encodeURIComponent(JSON.stringify(m));
  assert.equal(
    decodeEvent(addr({ event: 'ready', bootNonce: 'old' }), 'nonce'),
    null
  );
  assert.equal(
    decodeEvent(
      addr({ event: 'close', bootNonce: 'nonce', safe: true }),
      'nonce'
    ),
    null
  );
  assert.equal(decodeEvent('https://evil.invalid/?m=x', 'nonce'), null);
  assert.equal(
    decodeEvent(
      addr({ event: 'arbitrary-shell', bootNonce: 'nonce' }),
      'nonce'
    ),
    null
  );
});
test('download admission requires one exact upstream checksum and contained archive names', () => {
  const hash = 'a'.repeat(64);
  assert.equal(checksumEntry(hash + ' *exact.zip\n', 'exact.zip'), hash);
  assert.throws(() => checksumEntry(hash + ' wrong.zip', 'exact.zip'));
  assert.throws(() =>
    checksumEntry(hash + ' exact.zip\n' + hash + ' exact.zip', 'exact.zip')
  );
  assert.throws(() => safeArchiveNames('safe/file\n../escape'));
  assert.throws(() => safeArchiveNames('/absolute'));
  safeArchiveNames('Electron.app/Contents/Info.plist\nLICENSE');
});
test('Tauri project generation pins versions in an isolated project with no renderer permissions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h34-project-'));
  try {
    tauriProject(
      dir,
      { tauriNpmCli: '2.12.4', tauriCrate: '2.12.5', tauriBuildCrate: '2.7.4' },
      source
    );
    const config = JSON.parse(
      readFileSync(join(dir, 'src-tauri/tauri.conf.json'))
    );
    assert.deepEqual(config.app.security.capabilities, []);
    assert.deepEqual(config.app.windows, []);
    assert.equal(config.app.withGlobalTauri, false);
    assert.match(
      readFileSync(join(dir, 'src-tauri/Cargo.toml'), 'utf8'),
      /tauri = \{ version = "=2.12.5", features = \[\] \}/
    );
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'package.json'))).dependencies[
        '@tauri-apps/cli'
      ],
      '2.12.4'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('actual copied common Core supports packaged CLI/MCP same-head smoke without GUI/user PATH', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h34-common-')),
    a = join(dir, 'A'),
    b = join(dir, 'B');
  const worker = (mode, target, extra = '') => {
    const p = spawnSync(
      process.execPath,
      [join(source, 'worker.mjs'), mode, target, extra],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 }
    );
    assert.equal(p.status, 0, p.stderr);
    return p.stdout.trim();
  };
  const sessions = [];
  try {
    worker('pack', a, join(dir, 'graphs.json'));
    const hashes = graphSourceHashes(
      JSON.parse(readFileSync(join(dir, 'graphs.json'))),
      process.cwd()
    );
    assert.ok(Object.keys(hashes).length > 10);
    worker('manifest', a);
    cpSync(a, b, { recursive: true });
    assert.equal(tree(a).sha256, tree(b).sha256);
    for (const target of [a, b]) {
      const r = JSON.parse(worker('smoke', target));
      sessions.push(r.session);
      assert.equal(r.ok, true);
      assert.equal(r.cliAndMcpSameHead, true);
      assert.equal(r.profile.node, process.version);
    }
    assert.notEqual(sessions[0], sessions[1]);
  } finally {
    for (const session of sessions) {
      try {
        const meta = JSON.parse(readFileSync(join(session, 'session.json')));
        rmSync(meta.vaultDir, { recursive: true, force: true });
        rmSync(session, { recursive: true, force: true });
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
test(
  'Linux build invocation is explicitly not a Mac compile or performance pass',
  { skip: process.platform === 'darwin' },
  () => {
    const p = spawnSync(process.execPath, [join(source, 'run.mjs')], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(p.status, 2, p.stderr);
    const r = JSON.parse(p.stdout);
    assert.equal(r.status, 'MAC_ARM64_REQUIRED');
    assert.equal(r.builds, 'not-run');
    assert.equal(r.performance, 'not-run');
  }
);

const { mkdirSync, writeFileSync, symlinkSync } = await import('node:fs');
const { nestedSigningPlan, signArguments } = await import('./signing.mjs');
const { retryId, loadRetry } = await import('./retry.mjs');
test('Tauri required icon exists as valid RGBA PNG at its configured path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'h35-icon-'));
  try {
    tauriProject(
      dir,
      { tauriNpmCli: '2.12.4', tauriCrate: '2.12.5', tauriBuildCrate: '2.7.4' },
      source
    );
    const config = JSON.parse(
      readFileSync(join(dir, 'src-tauri/tauri.conf.json'))
    );
    assert.deepEqual(config.bundle.icon, ['icons/icon.png']);
    const bytes = readFileSync(join(dir, 'src-tauri', config.bundle.icon[0]));
    const { validateBytes } =
      await import('../../../../packages/foundation-runtime/src/adapters/media-formats.mjs');
    validateBytes(bytes, 'image/png');
    assert.equal(bytes[25], 6, 'RGBA color type');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('nested Electron code signs real leaves before containing bundles, excluding CoreData and alias duplicates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h35-sign-'));
  try {
    const fw = join(dir, 'Contents/Frameworks/Engine.framework'),
      a = join(fw, 'Versions/A'),
      helper = join(a, 'Helpers/Worker.app');
    mkdirSync(join(helper, 'Contents/MacOS'), { recursive: true });
    mkdirSync(join(a, 'Resources'));
    const macho = Buffer.from('cffaedfe00000000', 'hex');
    writeFileSync(join(a, 'Engine'), macho);
    writeFileSync(join(helper, 'Contents/MacOS/Worker'), macho);
    symlinkSync('A', join(fw, 'Versions/Current'));
    symlinkSync('Versions/Current/Resources', join(fw, 'Resources'));
    symlinkSync('Versions/Current/Engine', join(fw, 'Engine'));
    mkdirSync(join(dir, 'Contents/Resources/CoreData/runtime'), {
      recursive: true,
    });
    writeFileSync(join(dir, 'Contents/Resources/CoreData/runtime/node'), macho);
    const plan = nestedSigningPlan(dir);
    assert.equal(plan.length, 4);
    assert.equal(plan.at(-1).path, fw);
    assert.equal(plan.at(-2).path, helper);
    assert.equal(plan.filter((p) => p.kind === 'mach-o').length, 2);
    assert.ok(plan.every((p) => !p.path.includes('CoreData')));
    for (const p of plan) {
      assert.ok(!signArguments(p.path).includes('--deep'));
      assert.ok(signArguments(p.path).some((a) => a.includes('entitlements')));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('nested signing refuses a framework symlink escaping the generated frameworks tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h35-escape-'));
  try {
    mkdirSync(join(dir, 'Contents/Frameworks'), { recursive: true });
    symlinkSync(tmpdir(), join(dir, 'Contents/Frameworks/escape'));
    assert.throws(() => nestedSigningPlan(dir), /ESCAPES/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('retry ledger verifies original common resources and compiled inputs, refusing mutation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h35-retry-')),
    id = 'original-build',
    run = join(dir, id);
  try {
    mkdirSync(join(run, 'CommonCore'), { recursive: true });
    writeFileSync(join(run, 'CommonCore/file'), 'fixed');
    writeFileSync(join(run, 'source.mjs'), 'original');
    const inputs = { 'source.mjs': sha(Buffer.from('original')) };
    writeJson(join(run, 'input-source-hashes.json'), inputs);
    writeJson(join(run, 'build-report.json'), {
      id,
      format: 'clutter-matched-build34',
      manifestSha256: 'manifest',
      status: 'build-smoke-incomplete',
      commonCore: tree(join(run, 'CommonCore')),
      compiledInputSourceSha256: sha(JSON.stringify(inputs)),
    });
    assert.equal(loadRetry(dir, id, 'manifest').report.id, id);
    writeFileSync(join(run, 'source.mjs'), 'changed');
    assert.throws(
      () => loadRetry(dir, id, 'manifest'),
      /COMPILED_INPUT_CHANGED/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('retry option rejects paths and preserves a single explicit original build ID', () => {
  assert.equal(retryId([]), null);
  assert.equal(
    retryId(['--retry', '2026-11-16T09-58-25-103Z-7838dcfb']),
    '2026-11-16T09-58-25-103Z-7838dcfb'
  );
  assert.throws(() => retryId(['--retry', '../elsewhere']));
  assert.throws(() => retryId(['--retry', 'id', 'extra']));
});

test('generated Cargo manifest matches the actual user-supplied Tauri normalization exactly', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(
        source,
        '../../evidence/host-retry-normalization-36-2026-11-16/user-manifest-difference.json'
      )
    )
  );
  const dir = mkdtempSync(join(tmpdir(), 'h36-normalized-'));
  try {
    tauriProject(
      dir,
      { tauriNpmCli: '2.12.4', tauriCrate: '2.12.5', tauriBuildCrate: '2.7.4' },
      source
    );
    assert.equal(
      readFileSync(join(dir, 'src-tauri/Cargo.toml'), 'utf8'),
      fixture.original
    );
    assert.notEqual(fixture.original, fixture.retry);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const { tauriRetrySource, keptArchive } = await import('./retry.mjs');
function partialRetryFixture() {
  const builds = mkdtempSync(join(tmpdir(), 'h36-history-'));
  const original = join(builds, 'original'),
    partial = join(builds, 'partial');
  const inputs = { 'source.mjs': sha(Buffer.from('same source')) };
  for (const dir of [original, partial]) {
    mkdirSync(join(dir, 'CommonCore'), { recursive: true });
    writeFileSync(join(dir, 'CommonCore/data'), 'same data');
    writeFileSync(join(dir, 'source.mjs'), 'same source');
    writeJson(join(dir, 'input-source-hashes.json'), inputs);
  }
  const base = {
    format: 'clutter-matched-build34',
    status: 'build-smoke-incomplete',
    manifestSha256: 'manifest',
    commonCore: tree(join(original, 'CommonCore')),
    compiledInputSourceSha256: sha(JSON.stringify(inputs)),
  };
  const candidate = (name) => ({
    status: 'built-signed-headless-smoke-pass',
    bundleSha256: name + '-bundle',
    archiveSha256: sha(Buffer.from(name + '-archive')),
  });
  mkdirSync(join(original, 'tauri-project/src-tauri'), { recursive: true });
  writeFileSync(join(original, 'tauri-project/package-lock.json'), 'npm lock');
  writeFileSync(
    join(original, 'tauri-project/src-tauri/Cargo.lock'),
    'cargo lock'
  );
  const report = {
    ...base,
    id: 'original',
    tauriLocks: {
      npmSha256: sha(Buffer.from('npm lock')),
      cargoSha256: sha(Buffer.from('cargo lock')),
    },
    candidates: {
      'H-S': candidate('S'),
      'H-E': { status: 'failed' },
      'H-T': { status: 'failed' },
    },
  };
  writeFileSync(join(original, 'H-S-darwin-arm64.zip'), 'S-archive');
  writeJson(join(original, 'build-report.json'), report);
  const newer = {
    ...base,
    id: 'partial',
    retryOf: 'original',
    previousReportSha256: sha(
      readFileSync(join(original, 'build-report.json'))
    ),
    candidates: {
      'H-S': { ...candidate('S'), verifiedKeptFrom: 'original' },
      'H-E': candidate('E'),
      'H-T': { status: 'failed', error: 'RETRY_DEPENDENCY_MANIFEST_CHANGED' },
    },
  };
  writeFileSync(join(partial, 'H-E-darwin-arm64.zip'), 'E-archive');
  writeJson(join(partial, 'build-report.json'), newer);
  return {
    builds,
    original,
    partial,
    previous: loadRetry(builds, 'partial', 'manifest'),
  };
}
test('partial retry retains both pass archives and obtains unchanged locks from the verified ancestor', () => {
  const f = partialRetryFixture();
  try {
    assert.equal(tauriRetrySource(f.builds, f.previous).report.id, 'original');
    assert.equal(
      keptArchive(f.builds, f.previous, 'H-S').path,
      join(f.original, 'H-S-darwin-arm64.zip')
    );
    assert.equal(
      keptArchive(f.builds, f.previous, 'H-E').path,
      join(f.partial, 'H-E-darwin-arm64.zip')
    );
  } finally {
    rmSync(f.builds, { recursive: true, force: true });
  }
});
test('retry ancestry refuses altered lock bytes or ancestor reports instead of resolving new dependencies', () => {
  const f = partialRetryFixture();
  try {
    const lock = join(f.original, 'tauri-project/src-tauri/Cargo.lock');
    writeFileSync(lock, 'changed');
    assert.throws(
      () => tauriRetrySource(f.builds, f.previous),
      /ANCESTOR_LOCK_CHANGED/
    );
    writeFileSync(lock, 'cargo lock');
    writeFileSync(join(f.original, 'build-report.json'), '{}');
    assert.throws(
      () => tauriRetrySource(f.builds, f.previous),
      /ANCESTOR_REPORT_CHANGED/
    );
  } finally {
    rmSync(f.builds, { recursive: true, force: true });
  }
});
