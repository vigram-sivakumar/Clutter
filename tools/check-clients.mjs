// Disposable acceptance runner. Real bundled CLI/MCP clients only; no direct API,
// SQLite, document bytes, alternate owner or UI feature logic.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  renameSync,
  constants,
  openSync,
  closeSync,
  fstatSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { pageContent, paragraph } from '../packages/editor/src/schema.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const title = 'Client check 68',
  marker = 'UI VERIFIED';
function requireThat(condition, code) {
  if (!condition) throw Error(code);
}
function privateRead(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = fstatSync(fd);
    requireThat(
      s.isFile() &&
        s.size < 1048576 &&
        (process.platform === 'win32' ||
          ((s.mode & 0o077) === 0 && s.uid === process.getuid())),
      'PRIVATE_CHECK_FILE_REQUIRED'
    );
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally {
    closeSync(fd);
  }
}
function privateWrite(path, value) {
  const temp = path + '.' + randomUUID() + '.part';
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  renameSync(temp, path);
}
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}
export function bundledClient(current, args, input = '') {
  const r = spawnSync(
    join(current.resources, 'runtime/node'),
    [
      join(current.resources, 'launcher.mjs'),
      '--session',
      current.session,
      ...args,
    ],
    { input, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 }
  );
  requireThat(
    !r.error && !r.signal && [0, 1].includes(r.status),
    'BUNDLED_CLIENT_FAILED'
  );
  let frames;
  try {
    frames = r.stdout.trim().split('\n').map(JSON.parse);
  } catch {
    throw Error('CLIENT_OUTPUT_INVALID');
  }
  return { status: r.status, frames };
}
export function peerRequest(current, mode, command) {
  if (mode === 'cli') {
    const r = bundledClient(current, [], JSON.stringify(command) + '\n');
    requireThat(
      r.frames.length === 1 && typeof r.frames[0].ok === 'boolean',
      'CLI_REPLY_INVALID'
    );
    requireThat(r.status === (r.frames[0].ok ? 0 : 1), 'CLI_EXIT_MISMATCH');
    return r.frames[0];
  }
  requireThat(mode === 'mcp', 'UNKNOWN_CLIENT');
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'clutter-client-check68', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'clutter_command', arguments: command },
    },
  ];
  const r = bundledClient(
    current,
    ['--mcp'],
    messages.map(JSON.stringify).join('\n') + '\n'
  );
  const byId = new Map(r.frames.map((frame) => [frame.id, frame]));
  requireThat(
    r.status === 0 &&
      byId.get(1)?.result?.protocolVersion === '2025-11-25' &&
      byId.get(2)?.result?.tools?.some((t) => t.name === 'clutter_command'),
    'MCP_HANDSHAKE_FAILED'
  );
  const call = byId.get(3)?.result;
  requireThat(
    call?.content?.length === 1 && call.content[0].type === 'text',
    'MCP_REPLY_INVALID'
  );
  const result = JSON.parse(call.content[0].text);
  requireThat(
    typeof result.ok === 'boolean' && call.isError === !result.ok,
    'MCP_ERROR_FLAG_MISMATCH'
  );
  return result;
}
function accepted(reply) {
  requireThat(reply.ok, reply.error?.code ?? 'COMMAND_FAILED');
  return reply.value;
}
const text = (node) =>
  (node.text ?? '') + (node.content ?? []).map(text).join('');
function assertMarkers(read, includeUi = false) {
  const content = read.content;
  requireThat(
    content?.format === 'clutter.page-json' &&
      content.schemaVersion === 2 &&
      read.title === title,
    'WRONG_TEST_DOCUMENT'
  );
  const body = content.value.content.slice(1).map(text).join('\n');
  for (const value of [
    'CLI CREATED',
    'MCP UPDATED',
    'CLI UPDATED',
    ...(includeUi ? [marker] : []),
  ])
    requireThat(
      body.includes(value),
      includeUi ? 'UI_MARKER_OR_TEST_TEXT_NOT_SAVED' : 'CLIENT_MARKER_MISSING'
    );
  requireThat(
    !body.includes('STALE MUST NOT APPEAR'),
    'CONFLICT_OVERWROTE_CONTENT'
  );
}
export async function runClientCheck({ phase, locator, recordsDirectory }) {
  requireThat(
    ['prepare', 'verify', 'verify-reopen'].includes(phase),
    'USE_PREPARE_VERIFY_OR_VERIFY_REOPEN'
  );
  const current = privateRead(locator);
  requireThat(
    current.format === 'clutter-structured-run53' &&
      typeof current.resources === 'string' &&
      typeof current.session === 'string',
    'WRONG_STRUCTURED_RUN'
  );
  const ensured = bundledClient(current, ['--ensure']);
  const owner = ensured.frames[0];
  requireThat(
    ensured.status === 0 && owner?.ok && owner.runtimeBundled && owner.ready,
    'WRONG_BUNDLED_OWNER'
  );
  const identity = createHash('sha256')
    .update(
      JSON.stringify([
        current.session,
        current.resources,
        owner.spaceId,
        owner.bundleId,
      ])
    )
    .digest('hex');
  mkdirSync(recordsDirectory, { recursive: true, mode: 0o700 });
  const st = lstatSync(recordsDirectory);
  requireThat(
    st.isDirectory() &&
      !st.isSymbolicLink() &&
      (process.platform === 'win32' ||
        ((st.mode & 0o077) === 0 && st.uid === process.getuid())),
    'PRIVATE_CHECK_DIRECTORY_REQUIRED'
  );
  const directory = join(recordsDirectory, identity);
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const planFile = join(directory, 'plan.json');
  const command = (method, extra = {}) => ({
    apiVersion: 1,
    spaceId: owner.spaceId,
    method,
    ...extra,
  });
  let plan;
  if (phase === 'prepare') {
    try {
      privateRead(planFile);
      throw Error('CHECK_ALREADY_PREPARED_USE_VERIFY');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    plan = {
      format: 'clutter-client-check68',
      identity,
      pageId: 'clientcheck68_' + randomUUID().replaceAll('-', ''),
      status: 'preparing',
      title,
      marker,
    };
    // Persist unique target before mutation: never restart a failed preparation
    // against another note or silently create duplicates.
    privateWrite(planFile, plan);
    let content = pageContent(title, 'CLI CREATED', {
      title: 'check-title',
      body: 'check-cli',
    });
    accepted(
      peerRequest(
        current,
        'cli',
        command('page.create', {
          pageId: plan.pageId,
          operationId: randomUUID(),
          kind: 'note',
          content,
          properties: {},
        })
      )
    );
    const first = accepted(
      peerRequest(current, 'cli', command('page.read', { pageId: plan.pageId }))
    );
    content = structuredClone(content);
    content.value.content.push(paragraph('check-mcp', 'MCP UPDATED'));
    accepted(
      peerRequest(
        current,
        'mcp',
        command('page.update', {
          pageId: plan.pageId,
          operationId: randomUUID(),
          expectedHead: first.head,
          patch: { content },
        })
      )
    );
    const second = accepted(
      peerRequest(current, 'mcp', command('page.read', { pageId: plan.pageId }))
    );
    for (const mode of ['cli', 'mcp']) {
      const conflict = peerRequest(
        current,
        mode,
        command('page.update', {
          pageId: plan.pageId,
          operationId: randomUUID(),
          expectedHead: first.head,
          patch: { content: pageContent(title, 'STALE MUST NOT APPEAR') },
        })
      );
      requireThat(
        !conflict.ok && conflict.error?.code === 'CONFLICT',
        'STALE_WRITE_NOT_REJECTED'
      );
      const read = accepted(
        peerRequest(
          current,
          mode,
          command('page.read', { pageId: plan.pageId })
        )
      );
      requireThat(read.head === second.head, 'CONFLICT_CHANGED_ACCEPTED_HEAD');
    }
    content.value.content.push(paragraph('check-cli-update', 'CLI UPDATED'));
    accepted(
      peerRequest(
        current,
        'cli',
        command('page.update', {
          pageId: plan.pageId,
          operationId: randomUUID(),
          expectedHead: second.head,
          patch: { content },
        })
      )
    );
    const reads = ['cli', 'mcp'].map((mode) =>
      accepted(
        peerRequest(
          current,
          mode,
          command('page.read', { pageId: plan.pageId })
        )
      )
    );
    reads.forEach((read) => assertMarkers(read));
    requireThat(
      reads[0].head === reads[1].head &&
        JSON.stringify(reads[0].content) === JSON.stringify(reads[1].content),
      'CLIENT_ROOTS_DIFFER'
    );
    plan = {
      ...plan,
      status: 'prepared',
      preparedHead: reads[0].head,
      checks: {
        cliReadWrite: 'PASS',
        mcpHandshakeReadWrite: 'PASS',
        cliStaleConflict: 'PASS',
        mcpStaleConflict: 'PASS',
        sameAcceptedRoot: 'PASS',
      },
    };
    privateWrite(planFile, plan);
    return {
      status: 'peer-checks-pass-awaiting-ui',
      title,
      pageId: plan.pageId,
      checks: plan.checks,
      next: 'In the open app click Refresh pages, open Client check 68, confirm the three client lines, append UI VERIFIED in its BODY without removing existing text, then Save. Run --verify.',
      nativeVisual: 'user observation required',
    };
  }
  plan = privateRead(planFile);
  requireThat(
    plan.format === 'clutter-client-check68' &&
      plan.identity === identity &&
      ['prepared', 'ui-saved', 'window-reopened'].includes(plan.status),
    'PREPARE_THIS_SESSION_FIRST'
  );
  if (phase === 'verify-reopen') {
    requireThat(
      plan.uiSavedHead &&
        Number.isInteger(plan.uiPidAtVerify) &&
        Number.isInteger(current.uiPid),
      'VERIFY_UI_SAVE_FIRST'
    );
    requireThat(
      plan.uiPidAtVerify !== current.uiPid &&
        !alive(plan.uiPidAtVerify) &&
        alive(current.uiPid),
      'CLOSE_AND_REOPEN_SAME_APP_WINDOW_FIRST'
    );
  }
  const reads = ['cli', 'mcp'].map((mode) =>
    accepted(
      peerRequest(current, mode, command('page.read', { pageId: plan.pageId }))
    )
  );
  reads.forEach((read) => assertMarkers(read, true));
  requireThat(
    reads[0].head === reads[1].head &&
      JSON.stringify(reads[0].content) === JSON.stringify(reads[1].content),
    'CLIENT_ROOTS_DIFFER'
  );
  if (phase === 'verify-reopen')
    requireThat(
      reads[0].head === plan.uiSavedHead,
      'ACCEPTED_DOCUMENT_CHANGED_SINCE_SAVE_VERIFY'
    );
  const report = {
    format: 'clutter-client-check-result68',
    phase,
    status:
      phase === 'verify'
        ? 'ui-save-visible-to-cli-and-mcp'
        : 'same-root-after-window-reopen',
    checks: plan.checks,
    uiBodyMarker: 'PASS',
    sameAcceptedRoot: 'PASS',
    windowProcessReplaced: phase === 'verify-reopen',
    nativeVisual: 'not inferred; operator confirmation required',
    ownerRestart: 'not performed; this is window/context reopen',
  };
  privateWrite(planFile, {
    ...plan,
    status: phase === 'verify' ? 'ui-saved' : 'window-reopened',
    ...(phase === 'verify'
      ? { uiSavedHead: reads[0].head, uiPidAtVerify: current.uiPid ?? null }
      : {}),
  });
  privateWrite(join(directory, phase + '.json'), report);
  return {
    ...report,
    next:
      phase === 'verify'
        ? 'Close the test window with the red button, run npm run desktop:reopen, confirm the same note and UI VERIFIED remain, then run --verify-reopen.'
        : 'Return this result and the visual reopen observation. Formatting follows this acceptance.',
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    requireThat(
      process.argv.length === 3 &&
        /^--(?:prepare|verify|verify-reopen)$/.test(process.argv[2]),
      'USE_PREPARE_VERIFY_OR_VERIFY_REOPEN'
    );
    requireThat(
      execFileSync('git', ['branch', '--show-current'], {
        cwd: root,
        encoding: 'utf8',
      }).trim() === 'architecture/clutter-foundation',
      'FOUNDATION_BRANCH_REQUIRED'
    );
    const base = resolve(
      root,
      execFileSync('git', ['rev-parse', '--git-path', 'clutter-structured53'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    );
    console.log(
      JSON.stringify(
        await runClientCheck({
          phase: process.argv[2].slice(2),
          locator: join(base, 'latest.json'),
          recordsDirectory: join(base, 'client-check68'),
        }),
        null,
        2
      )
    );
  } catch (error) {
    console.error('Client check stopped: ' + error.message);
    process.exitCode = 1;
  }
}
