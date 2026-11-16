// UI bootstrap, CLI and MCP attach to the same headless Core. No UI-to-CLI writes.
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoreClient } from '@clutter/foundation-runtime';
import { runCli, runMcp } from '@clutter/foundation-runtime/stdio';
import { readSession } from './session.mjs';
export async function ensureOwner(resources, directory) {
  const m = readSession(directory, resources),
    url = `http://127.0.0.1:${m.port}`;
  const status = async () => {
    try {
      const r = await fetch(url + '/status', {
        headers: { authorization: 'Bearer ' + m.tokens.automation },
        signal: AbortSignal.timeout(500),
      });
      if (!r.ok) return null;
      const s = await r.json();
      return s.spaceId === m.spaceId &&
        s.bundleId === m.bundleId &&
        s.ready === true &&
        s.runtimeBundled === true
        ? s
        : null;
    } catch {
      return null;
    }
  };
  let s = await status();
  if (s) return { ...s, url };
  const fd = openSync(join(directory, 'owner-error.txt'), 'a', 0o600);
  const child = spawn(
    join(resources, 'runtime/node'),
    [join(resources, 'owner.mjs'), resources, directory],
    { detached: true, stdio: ['ignore', 'ignore', fd] }
  );
  closeSync(fd);
  child.on('error', () => {});
  child.unref();
  for (let i = 0; i < 120; i++) {
    s = await status();
    if (s) return { ...s, url };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('OWNER_UNAVAILABLE_NO_FALLBACK');
}
export async function main(resources, args) {
  const i = args.indexOf('--session');
  if (i < 0 || !args[i + 1]) throw Error('SESSION_REQUIRED');
  const directory = args[i + 1];
  args = [...args.slice(0, i), ...args.slice(i + 2)];
  const m = readSession(directory, resources),
    d = await ensureOwner(resources, directory);
  if (args[0] === '--ensure') {
    console.log(JSON.stringify({ ok: true, ...d }));
    return;
  }
  if (args[0] === '--control') {
    const c =
      args[1] === 'stop'
        ? { action: 'stop' }
        : { action: 'flags', flags: JSON.parse(args[1]) };
    const r = await fetch(d.url + '/control', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + m.tokens.admin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(c),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error('CONTROL_FAILED');
    console.log(JSON.stringify(await r.json()));
    return;
  }
  const client = new CoreClient(async (c) => {
    const r = await fetch(d.url + '/api', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + m.tokens.automation,
        'content-type': 'application/json',
      },
      body: JSON.stringify(c),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error('RPC_FAILED');
    return r.json();
  });
  if (args[0] === '--mcp') await runMcp(client);
  else await runCli(client, args);
}
// This entry is always bundled as launcher.mjs; importing exports in tests does not run it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(dirname(fileURLToPath(import.meta.url)), process.argv.slice(2)).catch(
    () => {
      process.stderr.write('FOUNDATION_LAUNCH_FAILED\n');
      process.exitCode = 1;
    }
  );
