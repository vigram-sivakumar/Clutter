import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-065: the Unsplash Access Key lives only in the proxy Worker (workers/unsplash-proxy). Nothing in the app may read
// it, name it, or authenticate to Unsplash itself. This audits the source, so the guarantee cannot quietly regress.
const SRC = path.resolve(__dirname, '../../..'); // apps/app/src
const APP = path.resolve(SRC, '..'); // apps/app

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);

    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('the app carries no Unsplash credential', () => {
  const files = sourceFiles(SRC);

  it('no source file names the Access Key variable or the Client-ID authorization scheme', () => {
    const offenders = files.filter((file) => /UNSPLASH_ACCESS_KEY|Client-ID|Accept-Version/.test(fs.readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('the only code that requests Unsplash is the proxy client, and it never requests api.unsplash.com', () => {
    const requesting = files.filter((file) => /fetch\([^)]*unsplash/i.test(fs.readFileSync(file, 'utf8')));
    const client = fs.readFileSync(path.join(__dirname, 'UnsplashApi.ts'), 'utf8');

    expect(requesting).toEqual([]);
    expect(client).toMatch(/getProxyBaseUrl\(\)/);
    expect(client).not.toMatch(/fetch\(\s*new URL\(\s*[`'"]https:\/\/api\.unsplash\.com/);
  });

  it('the Content-Security-Policy allows the proxy and not api.unsplash.com', () => {
    const csp = fs.readFileSync(path.join(APP, 'src-tauri/tauri.conf.json'), 'utf8');

    expect(csp).toContain('https://clutter-unsplash-proxy.vigram-work.workers.dev');
    expect(csp).not.toContain('api.unsplash.com');
  });

  it('there is no example or documented VITE_ variable for a key', () => {
    const declarations = fs.readFileSync(path.join(SRC, 'vite-env.d.ts'), 'utf8');

    expect(declarations).not.toMatch(/UNSPLASH_ACCESS_KEY/);
    expect(declarations).toMatch(/VITE_UNSPLASH_PROXY_URL/);
  });
});
