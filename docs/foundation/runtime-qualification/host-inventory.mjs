// Read-only host facts, not a benchmark. No app, owner, registry or vault is opened.
// Generated inventory is archived inside Git metadata, never in source folders.
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const branch = execFileSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (branch !== 'architecture/clutter-foundation')
  throw Error('FOUNDATION_BRANCH_REQUIRED_NO_INVENTORY_WRITTEN');

function read(command, args) {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
  });
  return r.status === 0 ? r.stdout.trim() : null;
}
const mac = process.platform === 'darwin';
const translated = mac
  ? read('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'])
  : null;
const inventory = {
  format: 'clutter-host-inventory-v1',
  contract: 'H01-v1',
  capturedAt: new Date().toISOString(),
  kind: 'facts-only-not-benchmark',
  platform: process.platform,
  architecture: process.arch,
  machine: os.machine(),
  model: mac ? read('/usr/sbin/sysctl', ['-n', 'hw.model']) : null,
  chip: mac
    ? read('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string'])
    : null,
  ramBytes: os.totalmem(),
  logicalCpuCount: os.cpus().length,
  osVersion: mac ? read('/usr/bin/sw_vers', ['-productVersion']) : null,
  osBuild: mac ? read('/usr/bin/sw_vers', ['-buildVersion']) : null,
  translated:
    translated === '1' ? true : translated === '0' ? false : 'unknown',
  inventoryRunnerNode: process.version,
  proposedReferenceClass:
    mac && process.arch === 'arm64' && os.totalmem() >= 16 * 1024 ** 3
      ? 'hardware-class-check-only-pending-binding'
      : 'different-or-unsupported-reference-profile',
  binding: 'not-yet-bound',
  stillRequiredBeforeTiming: [
    'local SSD/volume semantics and free capacity',
    'display refresh/resolution, font, viewport',
    'power/low-power/thermal conditions',
    'candidate/runtime/SQLite/compiler/SDK pins and artifact hashes',
    'validated presentation and full-process physical-footprint instruments',
  ],
  privacy:
    'No hostname, username, serial number, home path, tokens, environment or endpoint contents collected.',
};
const generated = execFileSync(
  'git',
  ['rev-parse', '--git-path', 'clutter-host-qualification/inventory'],
  { cwd: root, encoding: 'utf8' }
).trim();
const directory = resolve(root, generated);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const file = join(
  directory,
  'host-' +
    inventory.capturedAt.replace(/[:.]/g, '-') +
    '-' +
    randomUUID() +
    '.json'
);
const payload = JSON.stringify(inventory, null, 2) + '\n';
writeFileSync(file, payload, { flag: 'wx', mode: 0o600 });
process.stdout.write(payload);
