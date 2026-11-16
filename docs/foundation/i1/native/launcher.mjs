import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { session, json, atomicPrivate } from './session.mjs';
import { CoreClient } from '../../../../packages/foundation-runtime/src/client.ts';
import {
  runCli,
  runMcp,
} from '../../../../packages/foundation-runtime/src/adapters/stdio.ts';
const resources = dirname(fileURLToPath(import.meta.url)),
  args = process.argv.slice(2),
  i = args.indexOf('--session');
if (i < 0 || !args[i + 1]) throw Error('--session is required');
const directory = resolve(args[i + 1]);
args.splice(i, 2);
const m = session(directory, resources);
async function status() {
  try {
    const d = json(join(directory, 'endpoint.json'));
    if (
      d.format !== 'clutter-native-endpoint28' ||
      d.spaceId !== m.spaceId ||
      d.bundleId !== m.bundleId ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(d.url)
    )
      throw Error('WRONG_ENDPOINT');
    const r = await fetch(d.url + '/status', {
      headers: { authorization: 'Bearer ' + d.tokens.cli },
      signal: AbortSignal.timeout(1000),
    });
    if (!r.ok) throw Error('NO_OWNER');
    const s = await r.json();
    return s.spaceId === m.spaceId && s.bundleId === m.bundleId ? d : null;
  } catch {
    return null;
  }
}
const pause = () => new Promise((r) => setTimeout(r, 60));
async function ensure() {
  let d = await status();
  if (d) return d;
  const lock = join(directory, 'start.lock');
  let own = false;
  for (let n = 0; n < 120; n++) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      atomicPrivate(join(lock, 'owner.json'), { pid: process.pid });
      own = true;
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const p = json(join(lock, 'owner.json')).pid;
        try {
          process.kill(p, 0);
        } catch (e) {
          if (e.code === 'ESRCH') rmSync(lock, { recursive: true });
        }
      } catch {}
      d = await status();
      if (d) return d;
      await pause();
    }
  }
  if (!own) throw Error('OWNER_START_LOCK_TIMEOUT');
  try {
    d = await status();
    if (d) return d;
    const fd = openSync(join(directory, 'owner-error.txt'), 'a', 0o600);
    const child = spawn(
      process.execPath,
      [join(resources, 'owner.mjs'), resources, directory],
      { detached: true, stdio: ['ignore', 'ignore', fd] }
    );
    closeSync(fd);
    child.unref();
    for (let n = 0; n < 120; n++) {
      d = await status();
      if (d) return d;
      await pause();
    }
    throw Error('OWNER_START_FAILED');
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
const d = await ensure();
if (args[0] === '--ensure') {
  console.log(
    JSON.stringify({
      ok: true,
      spaceId: d.spaceId,
      status: await (
        await fetch(d.url + '/status', {
          headers: { authorization: 'Bearer ' + d.tokens.cli },
        })
      ).json(),
    })
  );
} else if (args[0] === '--control') {
  const c =
    args[1] === 'stop'
      ? { action: 'stop' }
      : { action: 'flags', flags: JSON.parse(args[1]) };
  const r = await fetch(d.url + '/control', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + d.tokens.admin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(c),
    signal: AbortSignal.timeout(10000),
  });
  console.log(JSON.stringify(await r.json()));
} else {
  const client = new CoreClient(async (c) => {
    const r = await fetch(d.url + '/api', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + d.tokens.cli,
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
