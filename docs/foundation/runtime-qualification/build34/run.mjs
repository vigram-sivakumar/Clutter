// Isolated matched BUILD smoke. No GUI launch, timing run, production install or old-session reuse.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  existsSync,
  readdirSync,
  lstatSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  lock,
  acquireRuntime,
} from '../../experiments/r07-two-view/joined-native/runtime.mjs';
import {
  tree,
  sha,
  writeJson,
  tauriProject,
  checksumEntry,
  safeArchiveNames,
  graphSourceHashes,
} from './projects.mjs';
import { nestedSigningPlan, signArguments } from './signing.mjs';
import { retryId, loadRetry } from './retry.mjs';
const requestedRetry = retryId(process.argv.slice(2));
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..');
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
const gitPath = (part) =>
  resolve(
    root,
    execFileSync(
      'git',
      ['rev-parse', '--git-path', 'clutter-host-qualification/' + part],
      { cwd: root, encoding: 'utf8' }
    ).trim()
  );
const manifestBytes = readFileSync(join(source, '../preflight-manifest.json')),
  meta = JSON.parse(manifestBytes);
if (
  sha(readFileSync(join(source, '../contract.json'))) !== meta.contract.sha256
)
  throw Error('H01_CONTRACT_CHANGED');
if (
  sha(readFileSync(resolve(source, '..', meta.commonOwnerRuntime.lockPath))) !==
  meta.commonOwnerRuntime.lockSha256
)
  throw Error('COMMON_RUNTIME_LOCK_CHANGED');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(
    JSON.stringify({
      status: 'MAC_ARM64_REQUIRED',
      builds: 'not-run',
      performance: 'not-run',
    })
  );
  process.exitCode = 2;
} else {
  const cache = gitPath('cache');
  mkdirSync(cache, { recursive: true });
  const nodeCache = join(cache, 'node');
  mkdirSync(nodeCache, { recursive: true });
  const archive = lock.archives.arm64.file;
  for (const parent of [
    gitPath('../clutter-native28/out/cache'),
    resolve(
      root,
      'docs/foundation/experiments/r07-two-view/joined-native/out/cache'
    ),
  ])
    if (
      !existsSync(join(nodeCache, archive)) &&
      existsSync(join(parent, archive))
    )
      copyFileSync(join(parent, archive), join(nodeCache, archive));
  console.log(
    'Preparing checksum-pinned common Node runtime. No global Node changes.'
  );
  const runtime = await acquireRuntime(nodeCache, 'arm64');
  if (process.version !== lock.version) {
    const child = spawn(
      runtime.binary,
      [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
      }
    );
    const code = await new Promise((ok, fail) => {
      child.once('exit', ok);
      child.once('error', fail);
    });
    process.exitCode = code ?? 1;
  } else await buildAll(runtime, cache);
}
async function buildAll(runtime, cache) {
  const id =
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
    dir = gitPath('builds/' + id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'logs'));
  const report = {
    format: 'clutter-matched-build34',
    id,
    status: 'building',
    scope:
      'Build + actual packaged headless CLI/MCP smoke only; GUI/installed discovery/host gates/performance NOT RUN',
    manifestSha256: sha(manifestBytes),
    commonRuntime: lock.version,
    candidates: {},
    events: [],
  };
  const previous = requestedRetry
    ? loadRetry(gitPath('builds'), requestedRetry, sha(manifestBytes))
    : null;
  if (previous) {
    report.retryOf = previous.report.id;
    report.previousReportSha256 = sha(
      readFileSync(join(previous.dir, 'build-report.json'))
    );
  }
  const checkpoint = () => writeJson(join(dir, 'build-report.json'), report);
  const buildEnv = {
    ...process.env,
    PATH: dirname(runtime.binary) + ':' + process.env.PATH,
    MACOSX_DEPLOYMENT_TARGET: '14.0',
    npm_config_cache: join(cache, 'npm'),
    CARGO_HOME: join(cache, 'cargo'),
    CARGO_TARGET_DIR: join(cache, 'tauri-target'),
    RUSTFLAGS: '',
    CARGO_ENCODED_RUSTFLAGS: '',
    CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS: 'fallback',
  };
  let serial = 0;
  async function run(label, command, args, options = {}) {
    console.log('[' + label + ']');
    const log = join(
      dir,
      'logs',
      String(++serial).padStart(2, '0') +
        '-' +
        label.replace(/[^a-z0-9-]/gi, '_') +
        '.txt'
    );
    const p = spawn(command, args, {
      cwd: options.cwd ?? dir,
      env: { ...buildEnv, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    p.stdout.on('data', (b) => {
      out += b;
    });
    p.stderr.on('data', (b) => {
      err += b;
    });
    const timer = options.timeout
      ? setTimeout(() => p.kill('SIGTERM'), options.timeout)
      : null;
    const pulse = setInterval(
      () => console.log('  still running ' + label + '…'),
      20000
    );
    let code;
    try {
      code = await new Promise((ok, fail) => {
        p.once('error', fail);
        p.once('exit', ok);
      });
    } finally {
      clearInterval(pulse);
      if (timer) clearTimeout(timer);
      writeFileSync(log, out + '\n' + err, { mode: 0o600 });
    }
    if (code !== 0)
      throw Error(label + ' failed (' + code + '): ' + err.slice(-5000));
    return out.trim();
  }
  const worker = (mode, resources, extra = '') =>
    run('core-' + mode, runtime.binary, [
      join(source, 'worker.mjs'),
      mode,
      resources,
      extra,
    ]);
  const common = join(dir, 'CommonCore');
  try {
    report.buildTools = {
      node: process.version,
      npm: await run('npm-version', 'npm', ['--version']),
      xcode: await run('xcode-version', '/usr/bin/xcodebuild', ['-version']),
      sdk: await run('sdk-version', '/usr/bin/xcrun', [
        '--sdk',
        'macosx',
        '--show-sdk-version',
      ]),
    };
    checkpoint();
    if (previous) {
      cpSync(join(previous.dir, 'CommonCore'), common, {
        recursive: true,
        dereference: false,
      });
      copyFileSync(
        join(previous.dir, 'input-source-hashes.json'),
        join(dir, 'input-source-hashes.json')
      );
      copyFileSync(
        join(previous.dir, 'bundle-graphs.json'),
        join(dir, 'bundle-graphs.json')
      );
      report.commonCore = previous.report.commonCore;
      report.compiledInputSourceSha256 =
        previous.report.compiledInputSourceSha256;
      report.hostBuildSourceSha256 = tree(source).sha256;
      if (tree(common).sha256 !== report.commonCore.sha256)
        throw Error('RETRY_COPY_CHANGED_COMMON_CORE');
      checkpoint();
    } else {
      await worker('pack', common, join(dir, 'bundle-graphs.json'));
      const graph = JSON.parse(
        readFileSync(join(dir, 'bundle-graphs.json'), 'utf8')
      );
      const sourceHashes = graphSourceHashes(graph, dir);
      writeJson(join(dir, 'input-source-hashes.json'), sourceHashes);
      report.compiledInputSourceSha256 = sha(JSON.stringify(sourceHashes));
      report.hostBuildSourceSha256 = tree(source).sha256;
      copyFileSync(runtime.license, join(common, 'NODE-LICENSE.txt'));
      await run('sign-common-node', '/usr/bin/codesign', [
        '--force',
        '--sign',
        '-',
        join(common, 'runtime/node'),
      ]);
      await worker('manifest', common);
      report.commonCore = tree(common);
      checkpoint();
    }
    let rust;
    async function swiftApp() {
      const app = join(dir, 'Clutter H-S.app'),
        contents = join(app, 'Contents');
      mkdirSync(join(contents, 'MacOS'), { recursive: true });
      mkdirSync(join(contents, 'Resources'));
      await run('compile-H-S', '/usr/bin/xcrun', [
        'swiftc',
        '-parse-as-library',
        '-swift-version',
        '5',
        '-O',
        '-framework',
        'Cocoa',
        '-framework',
        'WebKit',
        join(source, 'Control.swift'),
        '-o',
        join(contents, 'MacOS/ClutterHost34'),
      ]);
      writeFileSync(
        join(contents, 'Info.plist'),
        '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>ClutterHost34</string><key>CFBundleIdentifier</key><string>com.clutter.h01.hs</string><key>CFBundleName</key><string>Clutter H-S</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>'
      );
      return app;
    }
    async function electronApp() {
      const version = meta.candidatePins['H-E'].electron,
        name = `electron-v${version}-darwin-arm64.zip`,
        folder = join(cache, 'electron-' + version);
      mkdirSync(folder, { recursive: true });
      const checks = previous
        ? readFileSync(join(previous.dir, 'electron-SHASUMS256.txt'))
        : await download(
            `https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`,
            1024 * 1024
          );
      const digest = checksumEntry(checks.toString('utf8'), name);
      writeFileSync(join(dir, 'electron-SHASUMS256.txt'), checks);
      if (
        previous &&
        (previous.report.electronArchive?.version !== version ||
          previous.report.electronArchive?.sha256 !== digest)
      )
        throw Error('RETRY_ELECTRON_RELEASE_CHANGED');
      const archive = join(folder, name);
      if (!existsSync(archive)) {
        const bytes = await download(
          `https://github.com/electron/electron/releases/download/v${version}/${name}`,
          600 * 1024 * 1024
        );
        if (sha(bytes) !== digest) throw Error('ELECTRON_CHECKSUM_MISMATCH');
        writeFileSync(archive, bytes, { flag: 'wx' });
      }
      if (sha(readFileSync(archive)) !== digest)
        throw Error('ELECTRON_CHECKSUM_MISMATCH');
      safeArchiveNames(
        await run('list-electron', '/usr/bin/unzip', ['-Z1', archive])
      );
      const unpack = join(dir, 'electron-extracted');
      mkdirSync(unpack);
      await run('extract-electron', '/usr/bin/ditto', [
        '-x',
        '-k',
        archive,
        unpack,
      ]);
      const app = join(unpack, 'Electron.app'),
        resources = join(app, 'Contents/Resources'),
        appDir = join(resources, 'app');
      mkdirSync(appDir, { recursive: true });
      writeJson(join(appDir, 'package.json'), {
        name: 'clutter-h01-electron',
        version: '0.0.0',
        main: 'main.cjs',
        private: true,
      });
      copyFileSync(join(source, 'electron.cjs'), join(appDir, 'main.cjs'));
      copyFileSync(
        join(source, 'electron-preload.cjs'),
        join(appDir, 'preload.cjs')
      );
      for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
        if (!existsSync(join(unpack, name)))
          throw Error('ELECTRON_LICENSE_MISSING_' + name);
        copyFileSync(join(unpack, name), join(resources, name));
      }
      report.electronArchive = {
        version,
        file: name,
        sha256: digest,
        integrity:
          'verified against fetched upstream per-release checksum before extraction; manifest retained',
        compatibility: 'GUI not-run',
      };
      return app;
    }
    async function tauriApp() {
      const project = join(dir, 'tauri-project');
      mkdirSync(project);
      tauriProject(project, meta.candidatePins['H-T'], source);
      if (previous) {
        const old = join(previous.dir, 'tauri-project');
        for (const name of ['package.json', 'src-tauri/Cargo.toml'])
          if (
            !readFileSync(join(old, name)).equals(
              readFileSync(join(project, name))
            )
          )
            throw Error('RETRY_DEPENDENCY_MANIFEST_CHANGED');
        for (const [name, hash] of [
          ['package-lock.json', previous.report.tauriLocks?.npmSha256],
          ['src-tauri/Cargo.lock', previous.report.tauriLocks?.cargoSha256],
        ]) {
          const bytes = readFileSync(join(old, name));
          if (sha(bytes) !== hash) throw Error('RETRY_LOCK_CHANGED');
          copyFileSync(join(old, name), join(project, name));
        }
      } else {
        await run(
          'npm-lock-H-T',
          'npm',
          [
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--workspaces=false',
            '--package-lock=true',
            '--audit=false',
            '--fund=false',
          ],
          { cwd: project }
        );
      }
      await run(
        'npm-ci-H-T',
        'npm',
        [
          'ci',
          '--ignore-scripts',
          '--workspaces=false',
          '--audit=false',
          '--fund=false',
        ],
        { cwd: project }
      );
      const chain = 'stable-aarch64-apple-darwin';
      const compiler = await run('rust-compiler', 'rustup', [
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
        throw Error('RUST_TOOLCHAIN_CHANGED_EXPECTED_1_90_0_NO_AUTO_INSTALL');
      const rustc = await run('rustc-path', 'rustup', [
          'which',
          '--toolchain',
          chain,
          'rustc',
        ]),
        cargo = await run('cargo-path', 'rustup', [
          'which',
          '--toolchain',
          chain,
          'cargo',
        ]);
      rust = {
        compiler,
        rustcSha256: sha(readFileSync(rustc)),
        cargoSha256: sha(readFileSync(cargo)),
      };
      const tools = join(project, 'tools');
      mkdirSync(tools);
      symlinkSync(cargo, join(tools, 'cargo'));
      symlinkSync(rustc, join(tools, 'rustc'));
      const env = { RUSTC: rustc, PATH: tools + ':' + buildEnv.PATH };
      if (!previous) {
        await run(
          'cargo-lock-H-T',
          cargo,
          [
            'generate-lockfile',
            '--manifest-path',
            join(project, 'src-tauri/Cargo.toml'),
          ],
          { cwd: project, env }
        );
      }
      await run(
        'cargo-fetch-H-T',
        cargo,
        [
          'fetch',
          '--locked',
          '--manifest-path',
          join(project, 'src-tauri/Cargo.toml'),
        ],
        { cwd: project, env }
      );
      const cargoLock = readFileSync(join(project, 'src-tauri/Cargo.lock')),
        npmLock = readFileSync(join(project, 'package-lock.json'));
      report.tauriLocks = {
        cargoSha256: sha(cargoLock),
        npmSha256: sha(npmLock),
        policy:
          'Generated before dependency code build; npm ci SRI and cargo locked fetch checksums. Exact32/33 direct pins. No unsupported security/compatibility claim.',
      };
      checkpoint();
      const cli = join(project, 'node_modules/@tauri-apps/cli/tauri.js');
      // npm wrapper file name is discovered from its verified package manifest.
      const cliMeta = JSON.parse(
        readFileSync(
          join(project, 'node_modules/@tauri-apps/cli/package.json'),
          'utf8'
        )
      );
      const rel =
        typeof cliMeta.bin === 'string' ? cliMeta.bin : cliMeta.bin.tauri;
      await run(
        'compile-H-T',
        runtime.binary,
        [
          join(project, 'node_modules/@tauri-apps/cli', rel),
          'build',
          '--bundles',
          'app',
          '--target',
          'aarch64-apple-darwin',
          '--',
          '--locked',
          '--offline',
        ],
        { cwd: project, env: { ...env, RUSTUP_TOOLCHAIN: chain } }
      );
      if (
        sha(readFileSync(join(project, 'src-tauri/Cargo.lock'))) !==
          report.tauriLocks.cargoSha256 ||
        sha(readFileSync(join(project, 'package-lock.json'))) !==
          report.tauriLocks.npmSha256
      )
        throw Error('DEPENDENCY_LOCK_CHANGED_DURING_BUILD');
      const bundleDir = join(
        cache,
        'tauri-target/aarch64-apple-darwin/release/bundle/macos'
      );
      const names = readdirSync(bundleDir).filter((s) => s.endsWith('.app'));
      if (names.length !== 1) throw Error('EXPECTED_ONE_TAURI_APP');
      const app = join(dir, 'Clutter H-T.app');
      cpSync(join(bundleDir, names[0]), app, {
        recursive: true,
        dereference: false,
      });
      const metadata = JSON.parse(
        await run(
          'cargo-licenses',
          cargo,
          [
            'metadata',
            '--offline',
            '--locked',
            '--format-version',
            '1',
            '--manifest-path',
            join(project, 'src-tauri/Cargo.toml'),
          ],
          { cwd: project, env }
        )
      );
      const notices = join(app, 'Contents/Resources/ThirdPartyNotices');
      mkdirSync(notices, { recursive: true });
      const inventory = [];
      for (const p of metadata.packages) {
        const crate = dirname(p.manifest_path),
          files = [];
        for (const name of readdirSync(crate)) {
          if (
            /^(LICENSE|LICENCE|COPYING|NOTICE)([._-]|$)/i.test(name) &&
            lstatSync(join(crate, name)).isFile()
          ) {
            const dest = p.name + '-' + p.version + '-' + name;
            copyFileSync(join(crate, name), join(notices, dest));
            files.push(dest);
          }
        }
        inventory.push({
          name: p.name,
          version: p.version,
          license: p.license ?? null,
          noticeFiles: files,
        });
      }
      writeJson(join(notices, 'dependency-license-inventory.json'), {
        packages: inventory,
        completeLegalReview: false,
      });
      return app;
    }
    for (const [candidate, build] of [
      ['H-S', swiftApp],
      ['H-E', electronApp],
      ['H-T', tauriApp],
    ]) {
      if (
        previous?.report.candidates[candidate]?.status ===
        'built-signed-headless-smoke-pass'
      ) {
        const kept = previous.report.candidates[candidate];
        if (
          tree(kept.app).sha256 !== kept.bundleSha256 ||
          sha(
            readFileSync(join(previous.dir, candidate + '-darwin-arm64.zip'))
          ) !== kept.archiveSha256 ||
          tree(kept.resources).sha256 !== report.commonCore.sha256
        )
          throw Error('PREVIOUS_PASS_ARTIFACT_CHANGED');
        await run('verify-kept-' + candidate, '/usr/bin/codesign', [
          '--verify',
          '--deep',
          '--strict',
          kept.app,
        ]);
        report.candidates[candidate] = {
          ...kept,
          verifiedKeptFrom: previous.report.id,
        };
        checkpoint();
        continue;
      }
      report.candidates[candidate] = { status: 'building' };
      checkpoint();
      try {
        const app = await build(),
          resources = join(app, 'Contents/Resources/CoreData');
        mkdirSync(dirname(resources), { recursive: true });
        // Final identical CoreData is copied after native framework packaging/signing.
        if (!resolve(app).startsWith(resolve(dir) + '/'))
          throw Error('GENERATED_APP_OUTSIDE_BUILD');
        rmSync(resources, { recursive: true, force: true });
        cpSync(common, resources, {
          recursive: true,
          dereference: false,
          force: true,
        });
        if (tree(resources).sha256 !== report.commonCore.sha256)
          throw Error('COMMON_CORE_DATA_DIFFERED');
        const info = join(app, 'Contents/Info.plist');
        await run('candidate-id-' + candidate, '/usr/libexec/PlistBuddy', [
          '-c',
          'Set :CFBundleIdentifier com.clutter.h01.' +
            candidate.toLowerCase().replace('-', ''),
          info,
        ]);
        // Generated candidate bundle only: replace broad ATS exceptions with loopback allowance.
        spawnSync(
          '/usr/libexec/PlistBuddy',
          ['-c', 'Delete :NSAppTransportSecurity', info],
          { encoding: 'utf8' }
        );
        await run('local-network-' + candidate, '/usr/libexec/PlistBuddy', [
          '-c',
          'Add :NSAppTransportSecurity dict',
          '-c',
          'Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true',
          info,
        ]);
        if (candidate === 'H-E') {
          const plan = nestedSigningPlan(app);
          writeJson(
            join(dir, 'electron-signing-plan.json'),
            plan.map((item) => ({
              kind: item.kind,
              path: item.path.slice(app.length + 1),
            }))
          );
          for (const [index, item] of plan.entries())
            await run(
              'sign-nested-H-E-' + index,
              '/usr/bin/codesign',
              signArguments(item.path)
            );
        }
        await run(
          'sign-' + candidate,
          '/usr/bin/codesign',
          signArguments(app, { outer: true })
        );
        if (tree(resources).sha256 !== report.commonCore.sha256)
          throw Error('SIGNING_CHANGED_COMMON_CORE');
        await run('verify-' + candidate, '/usr/bin/codesign', [
          '--verify',
          '--deep',
          '--strict',
          app,
        ]);
        const smoke = JSON.parse(await worker('smoke', resources));
        if (!smoke.ok) throw Error('HEADLESS_SMOKE_FAILED');
        const bundleTree = tree(app),
          zip = join(dir, candidate + '-darwin-arm64.zip');
        await run('archive-' + candidate, '/usr/bin/ditto', [
          '-c',
          '-k',
          '--keepParent',
          app,
          zip,
        ]);
        report.candidates[candidate] = {
          status: 'built-signed-headless-smoke-pass',
          app,
          resources,
          bundleSha256: bundleTree.sha256,
          archiveSha256: sha(readFileSync(zip)),
          archiveBytes: readFileSync(zip).length,
          commonCoreSha256: tree(resources).sha256,
          smoke,
          gui: 'not-run',
          H01Gates: 'not-run',
          performance: 'not-run',
        };
      } catch (error) {
        report.candidates[candidate] = {
          status: 'failed',
          error: error.message,
        };
        console.error(candidate + ': ' + error.message);
      }
      checkpoint();
    }
    if (rust) report.rust = rust;
    report.status = Object.values(report.candidates).every(
      (c) => c.status === 'built-signed-headless-smoke-pass'
    )
      ? 'build-smoke-complete'
      : 'build-smoke-incomplete';
  } catch (error) {
    report.status = 'failed-before-candidates';
    report.error = error.message;
    console.error(error.message);
  }
  report.completedAt = new Date().toISOString();
  checkpoint();
  console.log(
    '\n' +
      JSON.stringify(
        {
          status: report.status,
          candidates: Object.fromEntries(
            Object.entries(report.candidates).map(([id, c]) => [
              id,
              { status: c.status, error: c.error },
            ])
          ),
          gui: 'not-run',
          performance: 'not-run',
          report: join(dir, 'build-report.json'),
        },
        null,
        2
      )
  );
  process.exitCode = report.status === 'build-smoke-complete' ? 0 : 1;
}
async function download(address, limit) {
  console.log('[download ' + new URL(address).pathname.split('/').at(-1) + ']');
  const response = await fetch(address, {
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw Error('DOWNLOAD_HTTP_' + response.status);
  const parts = [];
  let size = 0;
  for await (const bytes of response.body) {
    size += bytes.length;
    if (size > limit) throw Error('DOWNLOAD_LIMIT');
    parts.push(bytes);
  }
  return Buffer.concat(parts);
}
