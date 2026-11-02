import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The deployed configuration, read as text (tests run from the Worker's directory): the Worker is deployed from this file, so these are checks on what ships. */
const toml = readFileSync('wrangler.toml', 'utf8');
const setting = (name: string): string | undefined => new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm').exec(toml)?.[1]?.trim();

describe('wrangler.toml', () => {
  it('turns version preview URLs off', () => {
    expect(setting('preview_urls')).toBe('false');
  });

  it('allows exactly the origins the packaged app and the app’s dev servers run from, and nothing else', () => {
    const origins = (setting('ALLOWED_ORIGINS') ?? '').replace(/"/g, '').split(',').map((origin) => origin.trim());

    expect(origins).toEqual([
      'tauri://localhost',
      'http://tauri.localhost',
      'https://tauri.localhost',
      'http://localhost:1421', // tauri dev
      'http://localhost:1422', // dev:sandbox
      'http://localhost:5173', // the web dev server
    ]);
    expect(origins).not.toContain('*');
  });

  it('holds no key: the Access Key is a secret binding, not a variable', () => {
    expect(toml).not.toMatch(/^UNSPLASH_ACCESS_KEY\s*=/m);
  });

  it('keeps the per-client rate limit', () => {
    expect(toml).toMatch(/\[\[ratelimits\]\]/);
    expect(setting('simple')).toContain('limit = 60');
  });
});

describe('.dev.vars.example (local development only)', () => {
  const example = readFileSync('.dev.vars.example', 'utf8');
  const exampleValue = (name: string): string | undefined => new RegExp(`^${name}=(.*)$`, 'm').exec(example)?.[1]?.trim();

  it('lets the tauri dev origin and the packaged origin read replies from a local Worker', () => {
    const origins = (exampleValue('ALLOWED_ORIGINS') ?? '').split(',');

    expect(origins).toContain('http://localhost:1421');
    expect(origins).toContain('tauri://localhost');
  });

  it('holds a placeholder, not a key', () => {
    expect(exampleValue('UNSPLASH_ACCESS_KEY')).toBe('replace-with-your-access-key');
  });
});
