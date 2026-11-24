import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { handle } from '../src/index';
import { INSTALLER_SCRIPT } from '../src/installer';

const env = { RELEASES: { get() { throw new Error('Installer must not access R2'); } } } as unknown as Parameters<typeof handle>[1];
const url = 'https://updates.clutterapp.workers.dev/install.sh';

test('installer is reviewable plain text with no caching', async () => {
  const response = await handle(new Request(url), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(await response.text(), INSTALLER_SCRIPT);
});

test('installer HEAD has no body and writes are rejected', async () => {
  const head = await handle(new Request(url, { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await handle(new Request(url, { method: 'POST' }), env);
  assert.equal(post.status, 405);
});

test('installer shell syntax is valid without executing it', () => {
  const result = spawnSync('/bin/bash', ['-n'], { input: INSTALLER_SCRIPT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error ?? ''));
});

test('installer runs non-interactively and launches only after successful installation', () => {
  assert.doesNotMatch(INSTALLER_SCRIPT, /\/dev\/tty|\[y\/N\]/);
  const verified = INSTALLER_SCRIPT.indexOf('verify_app "$STAGE/Clutter.app"');
  const moved = INSTALLER_SCRIPT.indexOf('mv -n "$STAGE/Clutter.app" /Applications/');
  const success = INSTALLER_SCRIPT.indexOf('Clutter successfully installed!');
  const launch = INSTALLER_SCRIPT.indexOf('if ! open "$DEST"; then');
  assert.ok(verified >= 0 && moved > verified && success > moved && launch > success);
  assert.match(INSTALLER_SCRIPT, /Clutter is installed, but macOS could not launch it/);
});

test('installer displays version and location with optional terminal colors', () => {
  assert.match(INSTALLER_SCRIPT, /\[ -t 1 \]/);
  assert.match(INSTALLER_SCRIPT, /printenv NO_COLOR/);
  assert.match(INSTALLER_SCRIPT, /Version:/);
  assert.match(INSTALLER_SCRIPT, /Location:/);
  assert.doesNotMatch(INSTALLER_SCRIPT, /Architecture:/);
  const start = INSTALLER_SCRIPT.indexOf('    GREEN="" BOLD=""');
  const end = INSTALLER_SCRIPT.indexOf('    download "$BASE/appcast.xml"', start);
  assert.ok(start >= 0 && end > start);
  const result = spawnSync('/bin/bash', ['-eu', '-c', INSTALLER_SCRIPT.slice(start, end) + '\nstep_done "Downloaded universal application"'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '\nInstalling Clutter...\n\n✓ Downloaded universal application\n');
});
