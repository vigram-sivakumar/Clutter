import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNSPLASH_PROXY_URL } from './UnsplashApi';

// `tauri dev` runs the app from http://localhost:1421, an origin the deployed Worker refuses on purpose, so development
// reaches a local `wrangler dev` Worker (http://localhost:8787) instead. That address must be allowed by the dev security
// policy only: the packaged app's policy and the default address stay on the deployed Worker.
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../src-tauri/tauri.conf.json'), 'utf8')) as {
  build: { devUrl: string };
  app: { security: { csp: Record<string, string>; devCsp: Record<string, string> } };
};
const connectSrc = (policy: Record<string, string>) => (policy['connect-src'] ?? '').split(/\s+/);
const LOCAL_WORKER = 'http://localhost:8787';

describe('Unsplash proxy in development', () => {
  it('tauri dev runs from the origin the local Worker is told to allow', () => {
    expect(config.build.devUrl).toBe('http://localhost:1421');
  });

  it('the dev security policy allows the local Worker and the deployed one', () => {
    expect(connectSrc(config.app.security.devCsp)).toEqual(expect.arrayContaining([LOCAL_WORKER, DEFAULT_UNSPLASH_PROXY_URL]));
  });

  it('the packaged app policy allows only the deployed Worker, no localhost address', () => {
    const sources = connectSrc(config.app.security.csp);

    expect(sources).toContain(DEFAULT_UNSPLASH_PROXY_URL);
    expect(sources.filter((source) => /localhost:\d+/.test(source))).toEqual([]);
  });

  it('the default address stays the deployed Worker, so a build without an override is unchanged', () => {
    expect(DEFAULT_UNSPLASH_PROXY_URL).toBe('https://clutter-unsplash-proxy.vigram-work.workers.dev');
  });
});
