import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { sha, tree } from './projects.mjs';
import { loadBuild } from './retry.mjs';
import { sessionChoice } from '../../i1/native/lifecycle.mjs';
export function launchArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--run', '--candidate'].includes(key)) {
      if (result[key]) throw Error('DUPLICATE_HOST_ARGUMENT');
      result[key] = args[++i];
    } else if (['--reopen', '--new'].includes(key)) {
      if (result[key]) throw Error('DUPLICATE_HOST_ARGUMENT');
      result[key] = true;
    } else throw Error('UNKNOWN_HOST_ARGUMENT');
  }
  if (
    !/^[A-Za-z0-9-]{1,100}$/.test(result['--run'] ?? '') ||
    !['H-S', 'H-E', 'H-T'].includes(result['--candidate'])
  )
    throw Error('USE_--run_BUILD_ID_--candidate_H-S_OR_H-E_OR_H-T');
  if (result['--new'] && result['--reopen'])
    throw Error('CHOOSE_REOPEN_OR_NEW');
  return result;
}
export function completedCandidate(builds, id, candidate, manifestHash) {
  const build = loadBuild(builds, id, manifestHash, 'build-smoke-complete'),
    record = build.report.candidates[candidate];
  if (record?.status !== 'built-signed-headless-smoke-pass')
    throw Error('CANDIDATE_NOT_BUILT');
  if (
    !resolve(record.app).startsWith(resolve(builds) + sep) ||
    realpathSync(record.app) !== record.app ||
    resolve(record.resources) !==
      join(record.app, 'Contents/Resources/CoreData')
  )
    throw Error('CANDIDATE_PATH_MISMATCH');
  if (
    tree(record.app).sha256 !== record.bundleSha256 ||
    tree(record.resources).sha256 !== build.report.commonCore.sha256
  )
    throw Error('BUILT_CANDIDATE_CHANGED');
  return { build, record };
}
export function chooseGuiSession(previous, args, live) {
  if (live) throw Error('HOST_WINDOW_STILL_OPEN');
  try {
    return sessionChoice({
      existing: previous,
      reopen: args['--reopen'] === true,
      fresh: args['--new'] === true,
      isLive: () => false,
    });
  } catch (e) {
    if (e.message.startsWith('EXISTING_NATIVE28_SESSION'))
      throw Error('HOST_SESSION_EXISTS_USE_--reopen_OR_EXPLICIT_--new');
    throw e;
  }
}
export function nativeEvents(path, host) {
  let data;
  try {
    if (lstatSync(path).size > 1048576) throw Error('HOST_EVENT_LOG_LIMIT');
    data = readFileSync(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const lines = data.split('\n').slice(0, -1),
    events = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.length > 8192) throw Error('HOST_EVENT_FRAME_LIMIT');
    const e = JSON.parse(line);
    if (
      e.host !== host ||
      ![
        'ready',
        'error',
        'pdf-not-qualified',
        'close-guard',
        'renderer-gone-no-volatile-recovery-inferred',
        'preload-failed',
        'startup-failed',
      ].includes(e.event)
    )
      throw Error('HOST_EVENT_PROTOCOL_INVALID');
    events.push(e);
  }
  return events;
}
