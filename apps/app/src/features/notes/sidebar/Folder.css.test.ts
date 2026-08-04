import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This project's vitest config doesn't set `css: true` (confirmed by direct
// probe: getComputedStyle(...).pointerEvents reads back the browser default
// "auto" for an element styled `pointer-events: none` in Folder.css) —
// stylesheets are never loaded into jsdom during tests, so no
// getComputedStyle-based assertion here could ever meaningfully fail. This
// reads the source rule directly instead, as a guard against silently
// reintroducing the click-interception bug (an invisible .folder__icon
// sitting over .folder__caret in the same grid cell intercepts clicks
// meant for the caret — see the fix's comment in Folder.css itself for the
// full mechanism) — not a substitute for real browser/E2E verification.
const cssPath = fileURLToPath(new URL('./Folder.css', import.meta.url));
const css = readFileSync(cssPath, 'utf-8');

describe('Folder.css — .folder__icon must stay non-interactive', () => {
  it('the base .folder__icon rule sets pointer-events: none', () => {
    const baseRule = css.match(/\.folder__icon\s*{([^}]*)}/);

    expect(baseRule).not.toBeNull();
    expect(baseRule?.[1]).toMatch(/pointer-events:\s*none/);
  });
});
