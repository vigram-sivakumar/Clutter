import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNSPLASH_PROXY_URL } from './UnsplashApi';

// Every build reaches the one deployed Worker: `tauri dev` (http://localhost:1421), `dev:sandbox` (1422), the web dev
// server (5173) and the packaged app. Nothing local is started, so no `localhost:8787` address is allowed anywhere, and the
// dev origins the Worker is told to allow are the ones the app really runs from.
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../src-tauri/tauri.conf.json'), 'utf8')) as {
  build: { devUrl: string };
  app: { security: { csp: Record<string, string>; devCsp: Record<string, string> } };
};
const workerToml = fs.readFileSync(path.resolve(__dirname, '../../../../../../workers/unsplash-proxy/wrangler.toml'), 'utf8');
const workerAllowedOrigins = () =>
  (/^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(workerToml)?.[1] ?? '').split(',').map((origin) => origin.trim());
const connectSrc = (policy: Record<string, string>) => (policy['connect-src'] ?? '').split(/\s+/);

describe('Unsplash proxy in development', () => {
  it('tauri dev runs from an origin the deployed Worker allows', () => {
    expect(config.build.devUrl).toBe('http://localhost:1421');
    expect(workerAllowedOrigins()).toContain(config.build.devUrl);
  });

  it('dev:sandbox and the web dev server default to origins the deployed Worker allows', () => {
    const sandbox = fs.readFileSync(path.resolve(__dirname, '../../../../scripts/dev-sandboxed.sh'), 'utf8');

    expect(/DEV_SANDBOX_PORT:-(\d+)/.exec(sandbox)?.[1]).toBe('1422');
    expect(workerAllowedOrigins()).toEqual(expect.arrayContaining(['http://localhost:1422', 'http://localhost:5173']));
  });

  it('the dev security policy allows the deployed Worker and no local Worker address', () => {
    const sources = connectSrc(config.app.security.devCsp);

    expect(sources).toContain(DEFAULT_UNSPLASH_PROXY_URL);
    expect(sources.filter((source) => source.includes(':8787'))).toEqual([]);
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
