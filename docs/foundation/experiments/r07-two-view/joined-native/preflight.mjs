import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
export function preflight({
  platform = process.platform,
  arch = process.arch,
  exec = spawnSync,
} = {}) {
  const result = {
    platform,
    arch,
    ready: false,
    nativeAcceptance: 'not-run',
    checks: [],
  };
  if (platform !== 'darwin') {
    result.checks.push({
      name: 'macOS',
      status: 'blocked',
      reason:
        'Actual macOS build/run required; Linux tests cannot qualify WKWebView.',
    });
    return result;
  }
  if (!['arm64', 'x64'].includes(arch)) {
    result.checks.push({ name: 'architecture', status: 'blocked' });
    return result;
  }
  for (const [name, cmd, args] of [
    ['os', '/usr/bin/sw_vers', ['-productVersion']],
    ['compiler', '/usr/bin/xcrun', ['--find', 'swiftc']],
    ['sdk', '/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path']],
  ]) {
    const r = exec(cmd, args, { encoding: 'utf8' });
    const ok =
      r.status === 0 &&
      (name !== 'os' || Number(r.stdout.trim().split('.')[0]) >= 14);
    result.checks.push({
      name,
      status: ok ? 'pass' : 'blocked',
      value: (r.stdout || r.stderr || '').trim(),
      reason: ok
        ? null
        : 'This experiment requires macOS14+ and Xcode Command Line Tools.',
    });
  }
  try {
    accessSync('/usr/bin/codesign', constants.X_OK);
    result.checks.push({ name: 'signing-tool', status: 'pass' });
  } catch {
    result.checks.push({ name: 'signing-tool', status: 'blocked' });
  }
  result.ready = result.checks.every((c) => c.status === 'pass');
  return result;
}
