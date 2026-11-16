import { sessionChoice } from './lifecycle.mjs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack, manifest } from './pack.mjs';
import { createSession, json, session, atomicPrivate } from './session.mjs';
import {
  acquireRuntime,
  lock,
} from '../../experiments/r07-two-view/joined-native/runtime.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  repo = resolve(source, '../../../..');
const gitPath = (name) =>
  resolve(
    repo,
    execFileSync(
      'git',
      ['rev-parse', '--git-path', 'clutter-native28/' + name],
      { cwd: repo, encoding: 'utf8' }
    ).trim()
  );
const artifacts = gitPath('artifacts'),
  out = gitPath('out');
mkdirSync(artifacts, { recursive: true });
const exec = (c, a, options = {}) => {
  const r = spawnSync(c, a, { encoding: 'utf8', ...options });
  if (r.status !== 0 || r.error)
    throw Error(c + ': ' + (r.error?.message ?? r.stderr ?? r.status));
  return r.stdout;
};
const report = {
    format: 'clutter-native28-setup',
    started: new Date().toISOString(),
    status: 'not-run',
    macCompile: 'not-run',
    nativeObservations: 'not-run',
  },
  checkpoint = () => atomicPrivate(join(artifacts, 'latest.json'), report);
if (
  existsSync(join(artifacts, 'latest.json')) &&
  !process.argv.includes('--check')
)
  copyFileSync(
    join(artifacts, 'latest.json'),
    join(artifacts, 'setup-previous-' + Date.now() + '.json')
  );
if (process.argv.includes('--check')) {
  console.log(
    JSON.stringify(
      {
        supported: process.platform === 'darwin',
        node: process.version,
        arch: process.arch,
        requires: 'macOS14+, Xcode command line tools; native PDFKit/WKWebView',
      },
      null,
      2
    )
  );
  process.exitCode = process.platform === 'darwin' ? 0 : 2;
} else
  try {
    if (process.platform !== 'darwin')
      throw Error('MACOS_REQUIRED_NO_NATIVE_PASS');
    const choice = sessionChoice({
      existing: existsSync(join(artifacts, 'latest-session.json'))
        ? json(join(artifacts, 'latest-session.json'))
        : undefined,
      reopen: process.argv.includes('--reopen'),
      fresh: process.argv.includes('--new'),
      isLive: (pid, directory) => {
        const p = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'command='], {
          encoding: 'utf8',
        });
        return (
          !!p.stdout?.includes(directory) && p.stdout.includes('ClutterCore28')
        );
      },
    });
    if (choice) {
      const previous = choice;
      if (!previous.session || !previous.bundle)
        throw Error('NO_EXISTING_NATIVE28_SESSION');
      session(previous.session, join(previous.bundle, 'Contents/Resources'));
      Object.assign(report, {
        session: previous.session,
        bundle: previous.bundle,
        reopened: true,
        macCompile: 'previous-bundle-reused',
      });
    } else {
      const version = Number(
        exec('/usr/bin/sw_vers', ['-productVersion']).split('.')[0]
      );
      if (version < 14) throw Error('MACOS14_REQUIRED');
      exec('/usr/bin/xcrun', ['--find', 'swiftc']);
      console.log(
        'Preparing checksum-pinned Node ' +
          lock.version +
          '; first run may download the official archive.'
      );
      const cache = join(out, 'cache'),
        archive = lock.archives[process.arch];
      if (archive) {
        const old = join(
          repo,
          'docs/foundation/experiments/r07-two-view/joined-native/out/cache',
          archive.file
        );
        if (!existsSync(join(cache, archive.file)) && existsSync(old)) {
          mkdirSync(cache, { recursive: true });
          copyFileSync(old, join(cache, archive.file));
        }
      }
      const runtime = await acquireRuntime(cache, process.arch),
        id = new Date().toISOString().replace(/[:.]/g, '-'),
        bundle = join(out, 'Core28-' + id + '.app'),
        contents = join(bundle, 'Contents'),
        resources = join(contents, 'Resources'),
        mac = join(contents, 'MacOS');
      mkdirSync(mac, { recursive: true });
      report.bundle = bundle;
      console.log('Bundling browser-safe views and shared Core.');
      report.pack = await pack(resources, runtime.binary);
      copyFileSync(runtime.license, join(resources, 'NODE-LICENSE.txt'));
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
          '-framework',
          'PDFKit',
          join(source, 'Main.swift'),
          '-o',
          join(mac, 'ClutterCore28'),
        ],
        { env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '14.0' } }
      );
      report.macCompile = 'pass';
      writeFileSync(
        join(contents, 'Info.plist'),
        '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.clutter.foundation.core28</string><key>CFBundleName</key><string>Clutter Core28</string><key>CFBundleExecutable</key><string>ClutterCore28</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>28</string><key>LSMultipleInstancesProhibited</key><true/><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>'
      );
      exec('/usr/bin/codesign', [
        '--force',
        '--sign',
        '-',
        join(resources, 'runtime/node'),
      ]);
      manifest(resources, {
        runtime: { version: lock.version, archive: runtime.archive },
        scope: 'Synthetic Core28; not production/native durability acceptance',
      });
      exec('/usr/bin/codesign', ['--force', '--sign', '-', bundle]);
      exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
      report.session = createSession(resources);
      report.status = 'compiled-native-not-run';
    }
    exec('/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      report.bundle,
    ]);
    const resources = join(report.bundle, 'Contents/Resources'),
      ensure = JSON.parse(
        exec(join(resources, 'runtime/node'), [
          join(resources, 'launcher.mjs'),
          '--session',
          report.session,
          '--ensure',
        ])
      );
    const profile = ensure.status?.profile;
    if (
      profile?.node !== lock.version ||
      profile.platform !== 'darwin' ||
      profile.pragmas.fullfsync !== 1 ||
      profile.pragmas.checkpoint_fullfsync !== 1
    )
      throw Error('PACKAGED_RUNTIME_PROFILE_MISMATCH');
    report.headless = ensure;
    report.status = 'headless-ready-native-not-run';
    checkpoint();
    atomicPrivate(join(artifacts, 'latest-session.json'), report);
    const result = join(
      artifacts,
      'native28-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'
    );
    report.report = result;
    checkpoint();
    atomicPrivate(join(artifacts, 'latest-session.json'), report);
    const q=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
    const read={apiVersion:1,spaceId:ensure.spaceId,pageId:'page',method:'page.read'};
    console.log('Opening NEW Core28. Synthetic fixtures only. Start with Ready / NC28-01.\nReport: '+result+'\nSame-session reopen: npm run native:core28:reopen\nAfter quitting, read the same Space without the app:\nprintf \'%s\\n\' '+q(JSON.stringify(read))+' | '+q(join(resources,'bin/clutter-core28'))+' --session '+q(report.session)+'\nStop this synthetic service later:\n'+q(join(resources,'bin/clutter-core28'))+' --session '+q(report.session)+' --control stop');
    const child = spawn(
      join(report.bundle, 'Contents/MacOS/ClutterCore28'),
      ['--session', report.session, '--report', result],
      { stdio: 'inherit' }
    );
    report.uiPid = child.pid;
    atomicPrivate(join(artifacts, 'latest-session.json'), report);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    report.status = 'native-process-exited';
    report.exitCode = code;
    checkpoint();
    process.exitCode = code ?? 1;
  } catch (e) {
    report.status = 'blocked';
    report.reason = e.message;
    checkpoint();
    console.error(
      e.message +
        '\nSee ' +
        join(artifacts, 'latest.json') +
        '; no native pass inferred.'
    );
    process.exitCode = 1;
  }
