// Facts/capabilities only. No installs, app/owner launch, vault access or benchmarks.
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statfsSync,
  existsSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED_NO_PREFLIGHT_WRITTEN');
const source = dirname(fileURLToPath(import.meta.url));
const manifestBytes = readFileSync(join(source, 'preflight-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const contractBytes = readFileSync(resolve(source, manifest.contract.path));
const referenceBytes = readFileSync(resolve(source, manifest.reference.source));
if (
  digest(contractBytes) !== manifest.contract.sha256 ||
  digest(referenceBytes) !== manifest.reference.sha256
)
  throw Error('PREFLIGHT_CONTRACT_OR_REFERENCE_CHANGED');
const expected = JSON.parse(referenceBytes);
const runtimeBytes = readFileSync(
  resolve(source, manifest.commonOwnerRuntime.lockPath)
);
if (digest(runtimeBytes) !== manifest.commonOwnerRuntime.lockSha256)
  throw Error('COMMON_RUNTIME_LOCK_CHANGED');
const commonRuntime = JSON.parse(runtimeBytes);
const mac = process.platform === 'darwin';
const unavailable = [];
async function run(label, command, args, timeout = 10000) {
  // Subprocesses are facts/version probes from this fixed allowlist, never shell text.
  if (mac) process.stderr.write('Checking ' + label + '…\n');
  const r = spawnSync(command, args, {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) {
    unavailable.push(label);
    return null;
  }
  return r.stdout.trim();
}
function scalarPlist(xml, key) {
  if (!xml) return null;
  const m = xml.match(
    new RegExp(
      '<key>' +
        key +
        '</key>\\s*(?:<(true|false)\\s*/>|<string>([^<]*)</string>)'
    )
  );
  return m ? (m[1] ? m[1] === 'true' : m[2]) : null;
}
async function volume(path, label) {
  let space = {};
  try {
    const s = statfsSync(path);
    space = {
      typeCode: s.type,
      totalBytes: s.blocks * s.bsize,
      availableBytes: s.bavail * s.bsize,
    };
  } catch {
    unavailable.push(label + '-statfs');
  }
  let xml = null;
  if (mac) {
    const df = await run(label + '-mount', '/bin/df', ['-P', path]);
    const mount = df
      ?.split('\n')
      .at(-1)
      ?.match(/\s(\/.*)$/)?.[1]
      ?.replace(/\\040/g, ' ');
    if (mount)
      xml = await run(label + '-diskutil', '/usr/sbin/diskutil', [
        'info',
        '-plist',
        mount,
      ]);
  }
  return {
    ...space,
    filesystem: scalarPlist(xml, 'FilesystemType'),
    solidState: scalarPlist(xml, 'SolidState'),
    readOnly: scalarPlist(xml, 'ReadOnlyVolume'),
  };
}
let native = { status: 'not-macos' };
let machineFacts = null;
if (mac) {
  machineFacts = {
    model: await run('model', '/usr/sbin/sysctl', ['-n', 'hw.model']),
    chip: await run('chip', '/usr/sbin/sysctl', [
      '-n',
      'machdep.cpu.brand_string',
    ]),
    ramBytes: os.totalmem(),
    logicalCpuCount: os.cpus().length,
    osVersion: await run('os-version', '/usr/bin/sw_vers', ['-productVersion']),
    osBuild: await run('os-build', '/usr/bin/sw_vers', ['-buildVersion']),
  };
  const xcode = await run('xcode-version', '/usr/bin/xcodebuild', ['-version']);
  const swift = await run('swift-version', '/usr/bin/xcrun', [
    'swiftc',
    '--version',
  ]);
  const sdk = await run('sdk-version', '/usr/bin/xcrun', [
    '--sdk',
    'macosx',
    '--show-sdk-version',
  ]);
  const rustList = await run('installed-rust-toolchains', 'rustup', [
    'toolchain',
    'list',
  ]);
  const installed = (rustList ?? '')
    .split('\n')
    .map((s) => s.trim().split(' ')[0])
    .filter((s) => /^(stable|\d+\.\d+\.\d+)-[a-z0-9_-]+$/.test(s));
  const chain =
    installed.find((s) => s.startsWith('stable-aarch64-apple-darwin')) ??
    installed.find((s) => s.endsWith('-aarch64-apple-darwin'));
  // rustup run on an already-listed chain, WITHOUT --install. No automatic update.
  const rustc = chain
    ? await run('rustc-version', 'rustup', [
        'run',
        chain,
        'rustc',
        '--version',
        '--verbose',
      ])
    : null;
  const cargo = chain
    ? await run('cargo-version', 'rustup', ['run', chain, 'cargo', '--version'])
    : null;
  const traceVersion = await run('xctrace-version', '/usr/bin/xcrun', [
    'xctrace',
    'version',
  ]);
  const templates = await run(
    'xctrace-templates',
    '/usr/bin/xcrun',
    ['xctrace', 'list', 'templates'],
    20000
  );
  const power = await run('power-source', '/usr/bin/pmset', ['-g', 'batt']);
  const modes = await run('power-modes', '/usr/bin/pmset', ['-g', 'custom']);
  const thermal = await run('thermal', '/usr/bin/pmset', ['-g', 'therm']);
  const displaysText = await run(
    'display-metadata',
    '/usr/sbin/system_profiler',
    ['-json', 'SPDisplaysDataType'],
    20000
  );
  let displays = [];
  try {
    const parsed = JSON.parse(displaysText ?? '{}');
    displays = (parsed.SPDisplaysDataType ?? [])
      .flatMap((g) => g.spdisplays_ndrvs ?? [])
      .map((d, index) => {
        const values = Object.entries(d).filter(([k]) =>
          /resolution|refresh|pixels/i.test(k)
        );
        const refresh =
          values.find(([k]) => /refresh/i.test(k))?.[1] ??
          values
            .map(([, v]) => String(v))
            .join(' ')
            .match(/@\s*([\d.]+)\s*Hz/i)?.[1];
        return {
          index,
          main: d.spdisplays_main === 'spdisplays_yes',
          resolutions: [
            ...new Set(
              values.flatMap(
                ([, v]) => String(v).match(/\d{3,5}\s*x\s*\d{3,5}/gi) ?? []
              )
            ),
          ],
          refreshHz:
            refresh && /^[\d.]+(?:\s*Hz)?$/i.test(String(refresh))
              ? Number.parseFloat(refresh)
              : null,
        };
      });
  } catch {
    unavailable.push('display-json');
  }
  const wkVersion = await run('webkit-version', '/usr/bin/defaults', [
    'read',
    '/System/Library/Frameworks/WebKit.framework/Resources/Info',
    'CFBundleVersion',
  ]);
  native = {
    status: 'capabilities-only-not-qualified',
    xcode: xcode?.match(/Xcode\s+[\d.]+/)?.[0] ?? null,
    xcodeBuild: xcode?.match(/Build version\s+([a-zA-Z0-9]+)/)?.[1] ?? null,
    swift:
      swift
        ?.split('\n')
        .filter((s) => /Swift version|^Target:/.test(s))
        .join('\n') ?? null,
    sdk: sdk && /^[\d.]+$/.test(sdk) ? sdk : null,
    installedRustChain: chain ?? null,
    rustc:
      rustc
        ?.split('\n')
        .filter((s) =>
          /^(rustc |release:|host:|commit-hash:|LLVM version:)/.test(s)
        )
        .join('\n') ?? null,
    cargo: cargo?.match(/^cargo\s+[\d.]+[^\n]*/)?.[0] ?? null,
    xctrace:
      traceVersion?.match(
        /(?:xctrace\s+)?\d+\.\d+(?:\.\d+)?(?:\s+\([a-zA-Z0-9]+\))?/
      )?.[0] ?? null,
    advertisedTemplateNames: Object.fromEntries(
      [
        'Time Profiler',
        'System Trace',
        'Points of Interest',
        'VM Tracker',
        'Allocations',
        'Animation Hitches',
        'Core Animation',
      ].map((s) => [s, templates?.includes(s) ?? false])
    ),
    toolsPresent: Object.fromEntries(
      [
        '/usr/bin/footprint',
        '/usr/bin/vmmap',
        '/usr/bin/codesign',
        '/usr/bin/xattr',
      ].map((p) => [p.split('/').at(-1), existsSync(p)])
    ),
    powerSource: power?.includes('AC Power')
      ? 'AC'
      : power?.includes('Battery Power')
        ? 'battery'
        : 'unknown',
    lowPowerModes: [
      ...(modes ?? '').matchAll(/^\s*lowpowermode\s+(\d+)/gm),
    ].map((m) => Number(m[1])),
    thermalLimits: Object.fromEntries(
      [
        ...(thermal ?? '').matchAll(
          /(CPU_Speed_Limit|CPU_Scheduler_Limit|CPU_Available_CPUs)\s*=\s*(\d+)/g
        ),
      ].map((m) => [m[1], Number(m[2])])
    ),
    displays,
    webkitBuild: wkVersion && /^[\d.]+$/.test(wkVersion) ? wkVersion : null,
  };
}
const report = {
  format: 'clutter-host-preflight-v1',
  capturedAt: new Date().toISOString(),
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  kind: 'capability-preflight-not-benchmark',
  platform: process.platform,
  architecture: process.arch,
  machineFacts,
  hardwareMatches:
    mac &&
    process.arch === 'arm64' &&
    machineFacts?.model === expected.model &&
    machineFacts?.chip === expected.chip &&
    machineFacts?.ramBytes === expected.ramBytes &&
    machineFacts?.logicalCpuCount === expected.logicalCpuCount,
  osMatches:
    machineFacts?.osVersion === expected.osVersion &&
    machineFacts?.osBuild === expected.osBuild,
  reference: manifest.reference.id,
  inventoryRunnerNode: process.version,
  commonOwnerRuntime: commonRuntime.version,
  native,
  volumes: {
    repository: await volume(root, 'repo-volume'),
    tempFixtures: await volume(os.tmpdir(), 'temp-volume'),
  },
  unavailable: [...new Set(unavailable)],
  benchmarkReady: false,
  pending: manifest.stillBlocksTiming,
  privacy:
    'Allowlisted version/capability facts only. No raw display serials, host/user names, paths, power logs, Rust path overrides, secrets, endpoint or vault data emitted.',
};
const relative = execFileSync(
  'git',
  ['rev-parse', '--git-path', 'clutter-host-qualification/preflight'],
  { cwd: root, encoding: 'utf8' }
).trim();
const dir = resolve(root, relative);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const payload = JSON.stringify(report, null, 2) + '\n';
writeFileSync(
  join(
    dir,
    'preflight-' +
      report.capturedAt.replace(/[:.]/g, '-') +
      '-' +
      randomUUID() +
      '.json'
  ),
  payload,
  { flag: 'wx', mode: 0o600 }
);
process.stdout.write(payload);
