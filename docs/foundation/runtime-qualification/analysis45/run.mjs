// Analyze the already saved manual44 trace. No capture, GUI or app/owner changes.
import {
  readFileSync,
  mkdirSync,
  existsSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { planId, validatePlan, acquisitionGate } from '../manual44/model.mjs';
import { schemaNames } from '../instruments39/model.mjs';
import { sha, writeJson } from '../build34/projects.mjs';
import { exportTable } from '../trace42/export-table.mjs';
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
} else analyze();
function analyze() {
  const gitPath = (p) =>
      resolve(
        root,
        execFileSync(
          'git',
          ['rev-parse', '--git-path', 'clutter-host-qualification/' + p],
          { cwd: root, encoding: 'utf8' }
        ).trim()
      ),
    folder = gitPath('manual44/' + id);
  if (realpathSync(folder) !== folder) throw Error('INVALID_PLAN_DIRECTORY');
  const planBytes = readFileSync(join(folder, 'plan.json')),
    plan = validatePlan(JSON.parse(planBytes), folder);
  if (
    plan.contractSha256 !==
      sha(readFileSync(join(source, '../manual44/contract.json'))) ||
    realpathSync(plan.tracePath) !== plan.tracePath ||
    !lstatSync(plan.tracePath).isDirectory()
  )
    throw Error('MANUAL_TRACE_BINDING');
  const output = gitPath(
    'analysis45/' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8)
  );
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
      format: 'clutter-manual-relationships45',
      plan: id,
      candidate: plan.candidate,
      targetUiPid: plan.targetUiPid,
      bundleSha256: plan.bundleSha256,
      sourcePlanSha256: sha(planBytes),
      recording: 'not-run',
      status: 'analyzing',
      tables: [],
      ranking: 'not-qualified',
    },
    file = join(output, 'analysis-report.json'),
    checkpoint = () => writeJson(file, report);
  checkpoint();
  try {
    const toc = join(output, 'toc.xml'),
      p = spawnSync(
        '/usr/bin/xcrun',
        [
          'xctrace',
          'export',
          '--input',
          plan.tracePath,
          '--toc',
          '--output',
          toc,
        ],
        { encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024 }
      );
    writeJson(join(output, 'toc-status.json'), {
      status: p.status,
      errorCode: p.error?.code ?? null,
      stdout: p.stdout ?? '',
      stderr: p.stderr ?? '',
    });
    const schemas =
      p.status === 0 &&
      !p.error &&
      existsSync(toc) &&
      lstatSync(toc).size <= 8 * 1024 * 1024
        ? schemaNames(readFileSync(toc, 'utf8'))
        : [];
    report.acquisition = acquisitionGate(p.status, p.error?.code, schemas);
    if (report.acquisition !== 'readable-schema-gate-only')
      throw Error('SOURCE_TRACE_UNREADABLE');
    report.sourceTocSha256 = sha(readFileSync(toc));
    for (const schema of [
      'runloop-events',
      'visual-chain',
      'hitches-frame-lifetimes',
      'displayed-surfaces-interval',
      'time-info',
    ]) {
      report.tables.push(
        exportTable({
          schema,
          schemas,
          trace: plan.tracePath,
          output,
          uiPid: plan.targetUiPid,
        })
      );
      checkpoint();
    }
    const spec = join(output, 'relationship-spec.json');
    writeJson(spec, {
      directory: output,
      targetUiPid: plan.targetUiPid,
      tables: report.tables.map((t) => ({
        schema: t.schema,
        status: t.status,
      })),
    });
    const result = spawnSync(
      '/usr/bin/python3',
      [join(source, 'links.py'), spec],
      {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      }
    );
    if (result.error || result.status !== 0)
      throw Error('RELATIONSHIP_INSPECTION_UNAVAILABLE');
    report.relationships = JSON.parse(result.stdout);
    report.status = report.tables.every(
      (t) => t.status === 'structure-exported'
    )
      ? 'bounded-relationship-analysis-complete'
      : 'bounded-analysis-with-export-blockers';
    report.measurement =
      'not-qualified; candidate relationship inspection is not validated native input/presentation/clock mapping';
    report.next =
      'Review this one controlled pilot analysis. If exact links/units are absent or unmapped, record the concrete H11 blocker and required common instrumentation seam; no new recording or generic export loop.';
  } catch (e) {
    report.status = 'analysis-blocked';
    report.error = e.message;
    process.exitCode = 2;
  }
  checkpoint();
  console.log(JSON.stringify({ ...report, report: file }, null, 2));
}
