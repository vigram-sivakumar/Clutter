import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The deployed configuration, read as text (tests run from the Worker's directory): the Worker is deployed from this file, so these are checks on what ships. */
const toml = readFileSync('wrangler.toml', 'utf8');
const setting = (name: string): string | undefined => new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm').exec(toml)?.[1]?.trim();

describe('wrangler.toml', () => {
  it('turns version preview URLs off', () => {
    expect(setting('preview_urls')).toBe('false');
  });

  it('allows exactly the origins the packaged app runs from, and no dev-server origin', () => {
    const origins = (setting('ALLOWED_ORIGINS') ?? '').replace(/"/g, '').split(',').map((origin) => origin.trim());

    expect(origins).toEqual(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
    expect(origins.filter((origin) => /localhost:\d+/.test(origin))).toEqual([]);
  });

  it('holds no key: the Access Key is a secret binding, not a variable', () => {
    expect(toml).not.toMatch(/^UNSPLASH_ACCESS_KEY\s*=/m);
  });

  it('keeps the per-client rate limit', () => {
    expect(toml).toMatch(/\[\[ratelimits\]\]/);
    expect(setting('simple')).toContain('limit = 60');
  });
});
