// Runs under the pinned Core runtime, including factory and actual CLI/MCP probes.
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pack, manifest } from '../../i1/native/pack.mjs';
import { createSession, json } from '../../i1/native/session.mjs';
import { bootstrap } from './bootstrap.mjs';
const [mode, resources, extra] = process.argv.slice(2);
const run = (args, input = '') => {
  const p = spawnSync(
    join(resources, 'runtime/node'),
    [join(resources, 'launcher.mjs'), ...args],
    {
      input,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: '/usr/bin:/bin',
        NODE_OPTIONS: '',
        NODE_PATH: '',
      },
    }
  );
  if (p.status !== 0) throw Error('PACKAGED_CLI_FAILED ' + p.stderr);
  return p.stdout;
};
if (mode === 'pack') {
  const meta = await pack(resources, process.execPath);
  writeFileSync(extra, JSON.stringify(meta, null, 2) + '\n');
} else if (mode === 'manifest') {
  manifest(resources, {
    scope: 'H01 build34 smoke only; no host/performance/security qualification',
  });
} else if (mode === 'smoke') {
  const directory = createSession(resources);
  let query;
  try {
    const ensured = JSON.parse(run(['--session', directory, '--ensure']));
    query = {
      apiVersion: 1,
      spaceId: ensured.spaceId,
      pageId: 'page',
      method: 'page.read',
    };
    const cli = JSON.parse(
      run(['--session', directory], JSON.stringify(query) + '\n')
    );
    if (
      !cli.ok ||
      cli.value.body.value.content[0].content[0].text !== 'Alpha beta'
    )
      throw Error('CLI_CORE_BODY_MISMATCH');
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'h01-build34', version: '1' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'clutter_command', arguments: query },
      },
    ];
    const out = run(
      ['--session', directory, '--mcp'],
      requests.map((v) => JSON.stringify(v)).join('\n') + '\n'
    );
    const response = out
      .trim()
      .split('\n')
      .map((v) => JSON.parse(v))
      .find((v) => v.id === 2);
    const mcp =
      response?.result?.structuredContent ??
      JSON.parse(response?.result?.content?.[0]?.text ?? 'null');
    if (!mcp?.ok || mcp.value.head !== cli.value.head)
      throw Error('MCP_CORE_HEAD_MISMATCH');
    console.log(
      JSON.stringify({
        ok: true,
        spaceId: ensured.spaceId,
        session: directory,
        head: cli.value.head,
        sequence: cli.value.sequence,
        profile: ensured.status.profile,
        cliAndMcpSameHead: true,
        scope: 'Headless packaged Core smoke, no GUI or H01 gate pass',
      })
    );
  } finally {
    try {
      run(['--session', directory, '--control', 'stop']);
    } catch {}
  }
} else if (mode === 'boot') {
  // Explicit future GUI launch: separate new synthetic session, never NC28/latest-session.
  const directory = createSession(resources),
    ensured = JSON.parse(run(['--session', directory, '--ensure']));
  const descriptor = json(join(directory, 'endpoint.json'));
  const ui = {
    url: descriptor.url,
    token: descriptor.tokens.ui,
    spaceId: ensured.spaceId,
    png: readFileSync(join(resources, 'sample.png')).toString('base64'),
    pngAlt: readFileSync(join(resources, 'sample-alt.png')).toString('base64'),
    pdf: readFileSync(join(resources, 'sample.pdf')).toString('base64'),
  };
  const bootNonce = randomUUID(),
    cfg = {
      url: new URL(descriptor.url).href,
      ui,
      bootNonce,
      script: bootstrap(ui, bootNonce),
      report: extra,
    };
  const path = join(directory, 'host34-private.json');
  writeFileSync(path, JSON.stringify(cfg), { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
  console.log(
    JSON.stringify({
      session: directory,
      bootFile: path,
      spaceId: ensured.spaceId,
    })
  );
} else throw Error('UNKNOWN_WORKER_MODE');
