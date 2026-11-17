import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pack, manifest } from '../pack.mjs';
import {
  createSession,
  readSession,
  privateJSON,
  readJSON,
  hash,
} from '../../../packages/desktop-runtime/src/host/session.mjs';
import { ensureOwner } from '../../../packages/desktop-runtime/src/host/launcher.mjs';
import { bootstrap } from '../host/bootstrap.mjs';
import {
  windowArguments,
  windowDirectory,
  readWindowRecord,
} from '../host/window-records.mjs';
import { prepareLockedTools } from './locks.mjs';
import { setLoopbackPolicy } from './plist.mjs';
import { fetchLockedCargo } from './cargo-cache.mjs';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  root = resolve(source, '../..');
const [base, node, license, ...args] = process.argv.slice(2);
if (
  process.version !== 'v24.22.1' ||
  process.platform !== 'darwin' ||
  process.arch !== 'arm64'
)
  throw Error('PINNED_MAC_RUNTIME_REQUIRED');
const run = (label, command, arguments_, options = {}) => {
  console.log('[' + label + ']');
  const output = execFileSync(command, arguments_, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  return typeof output === 'string' ? output.trim() : '';
};
const latest = join(base, 'latest.json');
let current;
try {
  if (args.includes('--reopen')) {
    if (!existsSync(latest)) throw Error('NO_FOUNDATION_SESSION');
    current = readJSON(latest);
    readSession(current.session, current.resources);
    if (current.uiPid) {
      try {
        process.kill(current.uiPid, 0);
        throw Error('FOUNDATION_WINDOW_MAY_STILL_BE_OPEN');
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
      }
    }
  } else {
    if (existsSync(latest) && !args.includes('--new'))
      throw Error('EXISTING_FOUNDATION_SESSION_USE_REOPEN_OR_EXPLICIT_NEW');
    const id = new Date().toISOString().replace(/[:.]/g, '-'),
      directory = join(base, 'builds', id),
      project = join(directory, 'project');
    mkdirSync(project, { recursive: true });
    cpSync(join(source, 'src-tauri'), join(project, 'src-tauri'), {
      recursive: true,
    });
    mkdirSync(join(project, 'frontend'));
    writeFileSync(
      join(project, 'frontend/index.html'),
      '<!doctype html><title>Clutter Structured</title>'
    );
    mkdirSync(join(project, 'src-tauri/CoreData'));
    writeFileSync(
      join(project, 'src-tauri/CoreData/placeholder.txt'),
      'Core resources copied after compilation.'
    );
    const provenance = prepareLockedTools(project);
    privateJSON(join(directory, 'dependency-provenance.json'), provenance);
    const chain = 'stable-aarch64-apple-darwin',
      compiler = run('rust-version', 'rustup', [
        'run',
        chain,
        'rustc',
        '--version',
        '--verbose',
      ]);
    if (
      !compiler.includes('release: 1.90.0') ||
      !compiler.includes(
        'commit-hash: 1159e78c4747b02ef996e55082b704c09b970588'
      )
    )
      throw Error('EXPECTED_EXISTING_RUST_1_90_0_NO_AUTO_INSTALL');
    const rustc = run('rustc-path', 'rustup', [
        'which',
        '--toolchain',
        chain,
        'rustc',
      ]),
      cargo = run('cargo-path', 'rustup', [
        'which',
        '--toolchain',
        chain,
        'cargo',
      ]);
    const tools = join(project, 'tools');
    mkdirSync(tools);
    symlinkSync(node, join(tools, 'node'));
    symlinkSync(cargo, join(tools, 'cargo'));
    symlinkSync(rustc, join(tools, 'rustc'));
    const target = join(base, 'cargo-target'),
      env = {
        ...process.env,
        PATH: tools + ':' + process.env.PATH,
        RUSTC: rustc,
        RUSTUP_TOOLCHAIN: chain,
        CARGO_TARGET_DIR: target,
        CARGO_HOME: join(base, 'cache/cargo'),
        MACOSX_DEPLOYMENT_TARGET: '14.0',
        RUSTFLAGS: '',
        CARGO_ENCODED_RUSTFLAGS: '',
        CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS: 'fallback',
      };
    mkdirSync(env.CARGO_HOME, { recursive: true, mode: 0o700 });
    run(
      'locked-native-tools',
      'npm',
      [
        'ci',
        '--ignore-scripts',
        '--workspaces=false',
        '--no-audit',
        '--no-fund',
      ],
      { cwd: project, env, stdio: 'inherit' }
    );
    console.log(
      '[locked-native-dependencies: private cache, then locked acquisition if needed]'
    );
    const acquisition = fetchLockedCargo(
      cargo,
      join(project, 'src-tauri/Cargo.toml'),
      (command, args, options = {}) =>
        spawnSync(command, args, {
          cwd: project,
          env: {
            ...env,
            ...(options.online ? { CARGO_NET_OFFLINE: 'false' } : {}),
          },
          stdio: 'inherit',
        })
    );
    if (
      hash(readFileSync(join(project, 'src-tauri/Cargo.lock'))) !==
      provenance.cargoSha256
    )
      throw Error('LOCK_CHANGED_DURING_ACQUISITION');
    const cli = JSON.parse(
        readFileSync(join(project, 'node_modules/@tauri-apps/cli/package.json'))
      ),
      bin = typeof cli.bin === 'string' ? cli.bin : cli.bin.tauri;
    run(
      'build-selected-tauri',
      node,
      [
        join(project, 'node_modules/@tauri-apps/cli', bin),
        'build',
        '--bundles',
        'app',
        '--target',
        'aarch64-apple-darwin',
        '--',
        '--locked',
        '--offline',
      ],
      { cwd: project, env, stdio: 'inherit' }
    );
    if (
      hash(readFileSync(join(project, 'package-lock.json'))) !==
        provenance.npmSha256 ||
      hash(readFileSync(join(project, 'src-tauri/Cargo.lock'))) !==
        provenance.cargoSha256
    )
      throw Error('LOCK_CHANGED_DURING_BUILD');
    const built = join(target, 'aarch64-apple-darwin/release/bundle/macos'),
      names = readdirSync(built).filter((n) => n.endsWith('.app'));
    if (names.length !== 1) throw Error('EXPECTED_ONE_FOUNDATION_APP');
    const app = join(directory, 'Clutter Structured.app');
    cpSync(join(built, names[0]), app, { recursive: true, dereference: false });
    const resources = join(app, 'Contents/Resources/CoreData');
    const graph = await pack(resources, node);
    const inputs = Object.fromEntries(
      [...new Set([...graph.nodeInputs, ...graph.browserInputs])]
        .sort()
        .map((name) => [name, hash(readFileSync(resolve(root, name)))])
    );
    copyFileSync(license, join(resources, 'NODE-LICENSE.txt'));
    run('sign-pinned-node', '/usr/bin/codesign', [
      '--force',
      '--sign',
      '-',
      join(resources, 'runtime/node'),
    ]);
    manifest(resources);
    const plist = join(app, 'Contents/Info.plist');
    console.log('[local-network-policy]');
    setLoopbackPolicy(plist, (command, args) =>
      spawnSync(command, args, { encoding: 'utf8' })
    );
    run('sign-foundation', '/usr/bin/codesign', [
      '--force',
      '--sign',
      '-',
      app,
    ]);
    run('verify-foundation', '/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      app,
    ]);
    const session = await createSession(resources);
    if (existsSync(latest)) {
      const history = join(base, 'history');
      mkdirSync(history, { recursive: true });
      privateJSON(
        join(history, 'run-' + randomUUID() + '.json'),
        readJSON(latest)
      );
    }
    current = {
      format: 'clutter-structured-run53',
      app,
      resources,
      session,
      windowId: randomUUID(),
    };
    privateJSON(latest, current);
    privateJSON(join(directory, 'build-report.json'), {
      status: 'built-signed-not-native-qualified',
      runtime: process.version,
      compiler,
      dependencyProvenance: provenance,
      cargoAcquisition: acquisition,
      graph,
      compiledInputSha256: inputs,
      nativeSourceSha256: hash(
        readFileSync(join(source, 'src-tauri/src/main.rs'))
      ),
      native: 'not-run',
      performance: 'not-run',
    });
  }
  const endpoint = await ensureOwner(current.resources, current.session),
    m = readSession(current.session, current.resources);
  const selectedWindow = windowArguments(args).windowId;
  const windowsDirectory = windowDirectory(base, current.session);
  const requested = selectedWindow
    ? readWindowRecord(windowsDirectory, selectedWindow)
    : null;
  const host = {
    url: endpoint.url + '/',
    token: m.tokens.ui,
    spaceId: m.spaceId,
    windowId: requested?.windowId ?? current.windowId,
    initialPageId: requested?.initialPageId ?? null,
    windowsDirectory,
    bootNonce: randomUUID(),
  };
  host.script = bootstrap(host, {
    caretTrace: process.env.CLUTTER_CARET_TRACE === '1',
  });
  const config = join(base, 'host-' + randomUUID() + '.json');
  privateJSON(config, host);
  const executable = join(
    current.app,
    'Contents/MacOS/clutter-foundation-desktop'
  );
  const child = spawn(executable, ['--host-config', config], {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () =>
    console.error('Native window could not start; existing session retained.')
  );
  child.unref();
  current.uiPid = child.pid;
  privateJSON(latest, current);
  console.log(
    JSON.stringify(
      {
        status: 'native-window-launched-not-qualified',
        runtime: process.version,
        owner: 'headless-existing-Core',
        session: 'same-disposable-session',
        native: 'awaiting-user-observation',
        next: 'Use the new window only after its editor is ready. No old profiling suite is needed.',
        report: latest,
      },
      null,
      2
    )
  );
} catch (e) {
  console.error('Structured setup stopped: ' + e.message);
  console.error(
    'No native pass inferred. Existing sessions and previous builds retained.'
  );
  process.exitCode = 1;
}
