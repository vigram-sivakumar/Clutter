import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
export function preflight({
  platform = process.platform,
  exec = spawnSync,
} = {}) {
  const report = {
    platform,
    node: process.version,
    arch: process.arch,
    ready: false,
    checks: [],
    nativeAcceptance: 'not-run',
  };
  if (platform !== 'darwin') {
    report.checks.push({
      name: 'macOS',
      status: 'blocked',
      reason:
        'Requires a real Mac with Command Line Tools; no native result inferred on this host.',
    });
    return report;
  }
  for (const [name, args] of [
    ['compiler', ['--find', 'swiftc']],
    ['sdk', ['--sdk', 'macosx', '--show-sdk-path']],
    ['swift', ['swiftc', '--version']],
  ]) {
    const r = exec('/usr/bin/xcrun', args, { encoding: 'utf8' });
    report.checks.push({
      name,
      status: r.status === 0 ? 'pass' : 'blocked',
      value: r.status === 0 ? r.stdout.trim() : null,
      reason:
        r.status === 0
          ? null
          : 'Install/repair Xcode Command Line Tools (xcode-select --install), then rerun.',
    });
  }
  report.ready = report.checks.every((c) => c.status === 'pass');
  return report;
}
export const appInfo = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.clutter.foundation.r07lab</string>
<key>CFBundleName</key><string>Clutter R07 Lab</string>
<key>CFBundleDisplayName</key><string>Clutter R07 Lab</string>
<key>CFBundleExecutable</key><string>ClutterR07Lab</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/>
<key>NSExceptionDomains</key><dict><key>127.0.0.1</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict></dict></dict>
</dict></plist>`;
export function stageBundle(
  directory,
  metadata,
  resources = ['cases.json', 'capture.js']
) {
  const contents = join(resolve(directory), 'Clutter R07 Lab.app', 'Contents');
  mkdirSync(join(contents, 'MacOS'), { recursive: true });
  mkdirSync(join(contents, 'Resources'), { recursive: true });
  writeFileSync(join(contents, 'Info.plist'), appInfo);
  for (const name of resources)
    cpSync(new URL(name, import.meta.url), join(contents, 'Resources', name));
  writeFileSync(
    join(contents, 'Resources', 'build-info.json'),
    JSON.stringify(metadata, null, 2) + '\n'
  );
  return {
    bundle: resolve(contents, '..'),
    executable: join(contents, 'MacOS', 'ClutterR07Lab'),
  };
}
export function fingerprint(files) {
  return Object.fromEntries(
    files.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ])
  );
}
