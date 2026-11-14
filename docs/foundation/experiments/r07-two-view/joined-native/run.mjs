import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  mkdtempSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { preflight } from './preflight.mjs';
import { acquireRuntime, lock } from './runtime.mjs';
import { packResources, finishManifest, wrapper } from './pack.mjs';
import {
  atomicPrivate,
  checkSession,
  bundleIdentity,
} from './private-session.mjs';
import { headlessSmoke } from './smoke.mjs';
const lab = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(lab);
mkdirSync('artifacts', { recursive: true });
const setup = {
    startedAt: new Date().toISOString(),
    status: 'not-run',
    nativeAcceptance: 'not-run',
    preflight: preflight(),
  },
  checkpoint = () =>
    writeFileSync(
      'artifacts/joined-native-setup.json',
      JSON.stringify(setup, null, 2) + '\n'
    );
if (!setup.preflight.ready) setup.status = 'blocked';
checkpoint();
const exec = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.error || r.status !== 0)
    throw Error(cmd + ' failed: ' + (r.error?.message ?? r.status));
  return r;
};
if (process.argv.includes('--check')) {
  console.log(JSON.stringify(setup.preflight, null, 2));
  process.exitCode = setup.preflight.ready ? 0 : 2;
} else if (!setup.preflight.ready) {
  console.error(
    'Joined Mac runner blocked. See artifacts/joined-native-setup.json; requires macOS14+ and Xcode Command Line Tools.'
  );
  process.exitCode = 2;
} else
  try {
    exec(process.execPath, ['build.mjs']);
    exec(process.execPath, ['manifest.mjs']);
    console.log(
      'Preparing checksum-pinned Node ' +
        lock.version +
        ' for ' +
        process.arch +
        '; first run downloads the official archive.'
    );
    const runtime = await acquireRuntime(
      resolve('joined-native/out/cache'),
      process.arch
    );
    const runId = new Date().toISOString().replace(/[:.]/g, '-'),
      bundle = resolve('joined-native/out/Joined-' + runId + '.app'),
      contents = join(bundle, 'Contents'),
      resources = join(contents, 'Resources'),
      macOS = join(contents, 'MacOS');
    mkdirSync(macOS, { recursive: true });
    await packResources(resources, runtime.binary);
    copyFileSync(runtime.license, join(resources, 'NODE-LICENSE.txt'));
    copyFileSync('joined-native/cases.json', join(resources, 'cases.json'));
    exec(
      '/usr/bin/xcrun',
      [
        'swiftc',
        '-parse-as-library',
        '-swift-version',
        '5',
        '-O',
        '-framework',
        'Cocoa',
        '-framework',
        'WebKit',
        'joined-native/Main.swift',
        '-o',
        join(macOS, 'ClutterJoinedLab'),
      ],
      { env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '14.0' } }
    );
    writeFileSync(join(macOS, 'clutter-lab'), wrapper, { mode: 0o755 });
    writeFileSync(
      join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.clutter.foundation.joined16</string><key>CFBundleName</key><string>Clutter Joined Lab</string><key>CFBundleExecutable</key><string>ClutterJoinedLab</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>16</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>LSMultipleInstancesProhibited</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`
    );
    const dependencies = exec(
      '/usr/bin/otool',
      ['-L', join(resources, 'runtime/node')],
      { encoding: 'utf8', stdio: 'pipe' }
    ).stdout;
    for (const line of dependencies.split('\n').slice(1).filter(Boolean)) {
      const path = line.trim().split(' ')[0];
      if (!path.startsWith('/usr/lib/') && !path.startsWith('/System/Library/'))
        throw Error('UNBUNDLED_RUNTIME_DEPENDENCY ' + path);
    }
    exec('/usr/bin/codesign', [
      '--force',
      '--sign',
      '-',
      join(resources, 'runtime/node'),
    ]);
    exec('/usr/bin/codesign', [
      '--force',
      '--sign',
      '-',
      join(macOS, 'ClutterJoinedLab'),
    ]);
    finishManifest(resources, {
      runtime: { version: lock.version, archive: runtime.archive },
      source: JSON.parse(readFileSync('artifacts/candidate-manifest.json')),
      nativePreflight: setup.preflight,
      signing: 'ad-hoc, not notarized or sandbox/distribution acceptance',
    });
    exec('/usr/bin/codesign', ['--force', '--sign', '-', bundle]);
    exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    const run = mkdtempSync(join(realpathSync(tmpdir()), 'cj16-'));
    atomicPrivate(join(run, 'session.json'), {
      format: 'clutter-joined-native-session-v1',
      id: randomUUID(),
    });
    checkSession(run);
    setup.session = run;
    setup.bundle = bundle;
    setup.bundleId = bundleIdentity(resources);
    setup.headless = await headlessSmoke(resources, run);
    atomicPrivate(join(run, 'headless-report.json'), setup.headless);
    setup.profile = JSON.parse(
      readFileSync(join(run, 'endpoint.json'))
    ).profile;
    if (
      setup.profile.node !== lock.version ||
      setup.profile.pragmas.fullfsync !== 1 ||
      setup.profile.pragmas.checkpoint_fullfsync !== 1 ||
      !setup.profile.nativeFullSyncRequired
    )
      throw Error('PACKAGED_MAC_PROFILE_MISMATCH');
    setup.status = 'headless-pass-native-not-run';
    checkpoint();
    const report = resolve('artifacts', 'joined-native-' + runId + '.json');
    setup.report = report;
    checkpoint();
    const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
    const cli = join(macOS, 'clutter-lab');
    console.log(
      'Headless checks passed. Opening the real joined WKWebView lab. Start JN-01 only.\nReport: ' +
        report +
        '\nAfter quitting, read the same document without the desktop:\nprintf \'%s\\n\' \'{"method":"read"}\' | ' +
        quote(cli) +
        ' --session ' +
        quote(run) +
        '\nTo stop this synthetic owner later:\n' +
        quote(cli) +
        ' --session ' +
        quote(run) +
        ' --control stop'
    );
    const child = spawn(
      join(macOS, 'ClutterJoinedLab'),
      ['--session', run, '--report', report],
      { stdio: 'inherit' }
    );
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    setup.status = 'native-session-exited';
    setup.nativeExitCode = code;
    checkpoint();
    process.exitCode = code;
    // Deliberately do not tie owner lifetime to the desktop or builder process.
  } catch (error) {
    setup.status = 'blocked';
    setup.reason = error.message;
    checkpoint();
    console.error(
      error.message +
        '\nSee artifacts/joined-native-setup.json. No native pass is inferred.'
    );
    process.exitCode = 1;
  }
