import { resolve, sep } from 'node:path';
export function captureArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1];
    if (!['--run', '--candidate'].includes(key) || result[key] || !value)
      throw Error('USE_--run_ID_--candidate_H-T_OR_H-E');
    result[key] = value;
  }
  if (
    !/^[A-Za-z0-9-]{1,100}$/.test(result['--run'] ?? '') ||
    !['H-T', 'H-E'].includes(result['--candidate'])
  )
    throw Error('USE_--run_ID_--candidate_H-T_OR_H-E');
  return result;
}
export function parseProcessList(text) {
  const rows = [],
    seen = new Set();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) throw Error('PROCESS_LIST_FORMAT');
    const row = {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      uid: Number(m[3]),
      executable: m[4],
    };
    if (seen.has(row.pid) || !Number.isSafeInteger(row.pid))
      throw Error('PROCESS_LIST_FORMAT');
    seen.add(row.pid);
    rows.push(row);
  }
  return rows;
}
const within = (path, base) => path === base || path.startsWith(base + sep);
export function selectProcesses(rows, { app, resources, uiPid, uid }) {
  const base = resolve(app),
    runtime = resolve(resources, 'runtime/node'),
    root = rows.find((p) => p.pid === uiPid);
  if (
    !root ||
    root.uid !== uid ||
    !within(root.executable, base) ||
    root.executable === runtime
  )
    throw Error('EXPECTED_UI_NOT_RUNNING');
  const roles = new Map();
  for (const p of rows)
    if (p.uid === uid) {
      if (p.executable === runtime) roles.set(p.pid, 'bundled-owner-runtime');
      else if (within(p.executable, base))
        roles.set(p.pid, p.pid === uiPid ? 'ui' : 'bundled-helper');
      else if (
        /\/com\.apple\.WebKit\.[^/]+(?:\.xpc\/Contents\/MacOS\/[^/]+)?$/.test(
          p.executable
        )
      )
        roles.set(p.pid, 'shared-webkit-candidate');
    }
  // A system helper may not reside in the app or retain its parent after launch.
  // Descendants are additive evidence; all same-user WebKit services remain included.
  for (let changed = true; changed;) {
    changed = false;
    for (const p of rows)
      if (!roles.has(p.pid) && roles.has(p.ppid)) {
        roles.set(p.pid, 'observed-descendant');
        changed = true;
      }
  }
  if (roles.size > 256) throw Error('PROCESS_SET_LIMIT');
  return rows
    .filter((p) => roles.has(p.pid))
    .map((p) => ({ ...p, role: roles.get(p.pid) }));
}
export function sanitizeSample(selected, raw, after) {
  if (
    raw?.format !== 'clutter-process-counter39' ||
    raw.api !== 'proc_pid_rusage/RUSAGE_INFO_V4/ri_phys_footprint' ||
    raw.units !== 'bytes' ||
    !Array.isArray(raw.processes) ||
    raw.processes.length !== selected.length
  )
    throw Error('COUNTER_PROTOCOL');
  const expected = new Map(selected.map((p) => [p.pid, p])),
    seen = new Set(),
    rows = [];
  for (const p of raw.processes) {
    const bound = expected.get(p.pid);
    if (!bound || seen.has(p.pid)) throw Error('COUNTER_PID_MISMATCH');
    seen.add(p.pid);
    const current = after.find((x) => x.pid === p.pid),
      valid =
        p.status === 'read' &&
        typeof p.startTicks === 'string' &&
        /^[1-9]\d*$/.test(p.startTicks) &&
        p.executable === bound.executable &&
        current?.executable === p.executable &&
        current?.uid === bound.uid &&
        Number.isSafeInteger(p.physicalFootprintBytes) &&
        p.physicalFootprintBytes >= 0;
    let failure;
    if (!valid) {
      if (p.status !== 'read')
        failure = [
          'counter-first',
          'path',
          'counter-second',
          'start-identity',
        ].includes(p.failureStage)
          ? p.failureStage
          : 'native-unavailable';
      else if (p.executable !== bound.executable)
        failure = 'path-before-mismatch';
      else if (!current) failure = 'process-gone';
      else if (current.executable !== p.executable)
        failure = 'path-after-mismatch';
      else if (current.uid !== bound.uid) failure = 'user-changed';
      else failure = 'invalid-counter-or-identity';
    }
    rows.push({
      pid: p.pid,
      role: bound.role,
      status: valid ? 'read' : 'unavailable-or-changed',
      ...(!valid
        ? {
            failureStage: failure,
            ...(Number.isInteger(p.errorNumber) &&
            p.errorNumber >= 0 &&
            p.errorNumber <= 4096
              ? { errorNumber: p.errorNumber }
              : {}),
          }
        : {}),
      ...(valid
        ? {
            startTicks: p.startTicks,
            physicalFootprintBytes: p.physicalFootprintBytes,
          }
        : {}),
    });
  }
  const unavailable = rows.filter((p) => p.status !== 'read').length,
    owners = rows.filter((p) => p.role === 'bundled-owner-runtime').length;
  const sum = (xs) =>
    xs.reduce((a, p) => a + (p.physicalFootprintBytes ?? 0), 0);
  const shared = rows.filter((p) => p.role === 'shared-webkit-candidate');
  const confirmed = sum(
      rows.filter((p) => p.role !== 'shared-webkit-candidate')
    ),
    conservative = sum(rows);
  if (!Number.isSafeInteger(confirmed) || !Number.isSafeInteger(conservative))
    throw Error('FOOTPRINT_OVERFLOW');
  return {
    processes: rows,
    unavailableProcesses: unavailable,
    bundledOwnerProcesses: owners,
    sharedWebKitProcesses: shared.length,
    knownProcessSumBytes: unavailable ? null : confirmed,
    includingAllObservedSameUserWebKitBytes: unavailable ? null : conservative,
    attribution:
      'provisional; physical-footprint sums may double-count sharing, shared WebKit may include other apps; absence of matches cannot establish completeness',
    eligibleForRanking: false,
  };
}
export function schemaNames(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 8 * 1024 * 1024)
    throw Error('TRACE_TOC_LIMIT');
  return [
    ...new Set(
      [...xml.matchAll(/<schema\b[^>]*\bname="([A-Za-z0-9_.:-]{1,200})"/g)].map(
        (m) => m[1]
      )
    ),
  ].sort();
}
