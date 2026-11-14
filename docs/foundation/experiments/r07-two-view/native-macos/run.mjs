import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { preflight, stageBundle, fingerprint } from './support.mjs';
import { server } from '../serve.mjs';
const lab = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(lab);
mkdirSync('artifacts', { recursive: true });
const setup = {
  startedAt: new Date().toISOString(),
  status: 'not-run',
  nativeAcceptance: 'not-run',
};
const checkpoint = () =>
  writeFileSync(
    'artifacts/native-setup-result.json',
    JSON.stringify(setup, null, 2) + '\n'
  );
const report = preflight();
writeFileSync(
  'artifacts/native-preflight.json',
  JSON.stringify(report, null, 2) + '\n'
);
if (!report.ready) {
  setup.status = 'blocked';
  setup.preflight = report;
  checkpoint();
}
if (process.argv.includes('--check')) {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ready ? 0 : 2;
} else if (!report.ready) {
  console.error(
    'Native harness blocked. Read artifacts/native-preflight.json. A real Mac and Xcode Command Line Tools are required.'
  );
  process.exitCode = 2;
} else {
  const run = (cmd, args, options = {}) => {
    const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
    if (r.error || r.status !== 0)
      throw new Error(`${cmd} failed (${r.status ?? r.error?.message})`);
  };
  let app, child;
  try {
    run(process.execPath, ['build.mjs']);
    run(process.execPath, ['manifest.mjs']);
    const metadata = {
      createdAt: new Date().toISOString(),
      webAssetHashes: fingerprint([
        'dist/app.js',
        'dist/origin.js',
        'dist/control.js',
        'dist/index.html',
        'dist/origin.html',
        'dist/control.html',
        'dist/style.css',
        'dist/prosemirror.css',
        'dist/tables.css',
      ]),
      preflight: report,
      source: fingerprint([
        'package-lock.json',
        'native-macos/Main.swift',
        'native-macos/capture.js',
        'native-macos/cases.json',
        'native-macos/support.mjs',
        'native-macos/run.mjs',
      ]),
      candidateManifest: JSON.parse(
        readFileSync('artifacts/candidate-manifest.json', 'utf8')
      ),
      scope:
        'Local packaged AppKit/WKWebView host. Manual verdicts and automated fixture checks are separate. No production vault; ephemeral website data.',
    };
    const bundle = stageBundle('native-macos/out', metadata);
    run(
      '/usr/bin/xcrun',
      [
        'swiftc',
        '-swift-version',
        '5',
        '-O',
        '-framework',
        'Cocoa',
        '-framework',
        'WebKit',
        'native-macos/Main.swift',
        '-o',
        bundle.executable,
      ],
      { env: { ...process.env, MACOSX_DEPLOYMENT_TARGET: '12.0' } }
    );
    run('/usr/bin/codesign', ['--force', '--sign', '-', bundle.bundle]);
    app = await server(0, resolve(lab, 'dist'));
    const url = `http://127.0.0.1:${app.address().port}`;
    const output = resolve(
      'artifacts',
      `native-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    console.log(
      `Opening native lab. Use synthetic content. Quit with Command-Q when done.\nReport is saved automatically to:\n${output}`
    );
    setup.status = 'launched';
    setup.reportPath = output;
    checkpoint();
    child = spawn(bundle.executable, ['--url', url, '--report', output], {
      stdio: 'inherit',
    });
    const stop = () => child?.kill('SIGTERM');
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? 130 : (code ?? 1)));
    });
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.exitCode = code;
    setup.status = 'session-exited';
    setup.exitCode = code;
    checkpoint();
    console.log(`Native session ended. Share this JSON report:\n${output}`);
  } catch (error) {
    setup.status = 'blocked';
    setup.reason = error.message;
    checkpoint();
    console.error(
      error.message +
        '\nSetup report: ' +
        resolve('artifacts/native-setup-result.json')
    );
    process.exitCode = 1;
  } finally {
    if (app) await new Promise((resolve) => app.close(resolve));
  }
}
