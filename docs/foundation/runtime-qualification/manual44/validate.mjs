import {
  readFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { planId, validatePlan, acquisitionGate } from './model.mjs';
import { schemaNames } from '../instruments39/model.mjs';
import { sha, writeJson } from '../build34/projects.mjs';
const source = dirname(fileURLToPath(import.meta.url)),
  root = resolve(source, '../../../..'),
  id = planId(process.argv.slice(2));
if (
  execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
  }).trim() !== 'architecture/clutter-foundation'
)
  throw Error('FOUNDATION_BRANCH_REQUIRED');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log(
    JSON.stringify({ status: 'MAC_ARM64_REQUIRED', recording: 'not-run' })
  );
  process.exitCode = 2;
} else validate();
function validate() {
  const folder = resolve(
    root,
    execFileSync(
      'git',
      ['rev-parse', '--git-path', 'clutter-host-qualification/manual44/' + id],
      { cwd: root, encoding: 'utf8' }
    ).trim()
  );
  if (realpathSync(folder) !== folder) throw Error('INVALID_PLAN_DIRECTORY');
  const bytes = readFileSync(join(folder, 'plan.json')),
    plan = validatePlan(JSON.parse(bytes), folder);
  if (plan.contractSha256 !== sha(readFileSync(join(source, 'contract.json'))))
    throw Error('METHOD_CONTRACT_CHANGED');
  if (!existsSync(plan.tracePath)) {
    console.log(
      JSON.stringify({
        status: 'awaiting-saved-trace',
        tracePath: plan.tracePath,
        recording: 'not-run',
        measurement: 'not-qualified',
      })
    );
    process.exitCode = 2;
    return;
  }
  if (
    realpathSync(plan.tracePath) !== plan.tracePath ||
    !lstatSync(plan.tracePath).isDirectory()
  )
    throw Error('INVALID_SAVED_TRACE_PATH');
  const output = join(folder, 'validation-' + randomUUID());
  mkdirSync(output, { mode: 0o700 });
  const toc = join(output, 'toc.xml');
  const p = spawnSync(
    '/usr/bin/xcrun',
    ['xctrace', 'export', '--input', plan.tracePath, '--toc', '--output', toc],
    { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
  );
  writeJson(join(output, 'export-status.json'), {
    status: p.status,
    errorCode: p.error?.code ?? null,
    stdout: p.stdout ?? '',
    stderr: p.stderr ?? '',
  });
  let schemas = [];
  if (
    p.status === 0 &&
    !p.error &&
    existsSync(toc) &&
    lstatSync(toc).size <= 8 * 1024 * 1024
  )
    schemas = schemaNames(readFileSync(toc, 'utf8'));
  const report = {
    format: 'clutter-manual-validation44',
    plan: id,
    sourcePlanSha256: sha(bytes),
    candidate: plan.candidate,
    targetUiPid: plan.targetUiPid,
    bundleSha256: plan.bundleSha256,
    acquisition: acquisitionGate(p.status, p.error?.code, schemas),
    exportExit: p.status,
    errorCode: p.error?.code ?? null,
    schemas,
    measurement:
      'not-qualified; actual controlled input/producer/presentation/clock join still required',
    ranking: 'not-qualified',
    recording: 'not-run-by-validator',
    next: 'Return summary. Schema success alone never passes H11; if GUI acquisition fails, stop this method after the single pilot.',
  };
  writeJson(join(output, 'validation-report.json'), report);
  console.log(
    JSON.stringify(
      { ...report, report: join(output, 'validation-report.json') },
      null,
      2
    )
  );
  if (report.acquisition !== 'readable-schema-gate-only') process.exitCode = 2;
}
