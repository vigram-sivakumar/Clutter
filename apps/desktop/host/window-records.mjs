// Developer window locator mechanism. No document bodies, tokens or navigation policy.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  hash,
  readJSON,
} from '../../../packages/desktop-runtime/src/host/session.mjs';
const id = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function windowArguments(args) {
  const flags = [],
    used = new Set();
  let windowId = null;
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (used.has(a)) throw Error('DUPLICATE_RUNNER_ARGUMENT');
    used.add(a);
    if (a === '--window-id') {
      windowId = args[++n];
      if (!id(windowId)) throw Error('INVALID_WINDOW_ID');
    } else if (['--check', '--reopen', '--new'].includes(a)) flags.push(a);
    else throw Error('USE_CHECK_REOPEN_NEW_OR_WINDOW_ID');
  }
  if (
    (flags.includes('--new') && flags.includes('--reopen')) ||
    (windowId && !flags.includes('--reopen'))
  )
    throw Error('WINDOW_ID_REQUIRES_REOPEN');
  return { flags, windowId };
}
export function windowDirectory(base, session) {
  const directory = join(base, 'windows', hash(session));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}
export function readWindowRecord(directory, windowId) {
  if (!id(windowId)) throw Error('INVALID_WINDOW_ID');
  const record = readJSON(join(directory, windowId + '.json'));
  if (
    !record ||
    Object.keys(record).sort().join() !== 'initialPageId,windowId' ||
    record.windowId !== windowId ||
    !id(record.initialPageId)
  )
    throw Error('INVALID_WINDOW_RECORD');
  return record;
}
