import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index';

const base = 'https://updates.example.test';
const objects = new Map([
  ['appcast.xml', '<rss/>'],
  ['latest.json', '{}'],
  ['releases/Clutter_beta_0.0.7_aarch64.zip', 'legacy archive'],
  ['releases/Clutter_0.0.8_universal.zip', 'universal archive'],
  ['releases/Clutter_0.0.8_universal.dmg', 'installer'],
  ['releases/Clutter_9_to_10_universal.delta', 'patch'],
]);
const env = {
  RELEASES: {
    async get(key: string) {
      const value = objects.get(key);
      if (value === undefined) return null;
      return {
        size: value.length, httpEtag: '"test"', body: value,
        writeHttpMetadata(headers: Headers) {
          headers.set('Cache-Control', 'public, max-age=999999');
          headers.set('Content-Type', 'text/plain');
        },
      };
    },
  },
} as unknown as Parameters<typeof handle>[1];

test('feed and universal full/delta artifacts are exposed with authoritative metadata', async () => {
  for (const [path, type, body] of [
    ['/appcast.xml', 'application/rss+xml; charset=utf-8', '<rss/>'],
    ['/releases/Clutter_0.0.8_universal.zip', 'application/zip', 'universal archive'],
    ['/releases/Clutter_0.0.8_universal.dmg', 'application/x-apple-diskimage', 'installer'],
    ['/releases/Clutter_9_to_10_universal.delta', 'application/octet-stream', 'patch'],
  ]) {
    const response = await handle(new Request(base + path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), type);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(await response.text(), body);
  }
});
test('legacy routes remain available to previously installed clients', async () => {
  for (const path of ['/latest.json', '/releases/Clutter_beta_0.0.7_aarch64.zip']) {
    assert.equal((await handle(new Request(base + path), env)).status, 200);
  }
});
test('HEAD returns metadata without a body', async () => {
  const response = await handle(new Request(base + '/appcast.xml', {method: 'HEAD'}), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '6');
  assert.equal(await response.text(), '');
});
test('unapproved paths, missing releases and writes are rejected', async () => {
  for (const path of ['/secret', '/releases/anything.delta', '/releases/Clutter_9_to_11_universal.delta', '/releases/nested/Clutter_0.0.8_universal.zip']) {
    assert.equal((await handle(new Request(base + path), env)).status, 404);
  }
  const response = await handle(new Request(base + '/appcast.xml', {method: 'PUT'}), env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
});
