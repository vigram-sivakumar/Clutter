import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The Settings dialog is a fixed height, so a page with more groups than fit (Preferences has four) must scroll
 * inside it. jsdom does not lay anything out, so this checks the rule that makes the page scroll in the source.
 */
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'SettingsPage.css'), 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('SettingsPage scrolling', () => {
  it('scrolls vertically itself, and can shrink to the dialog instead of growing past it', () => {
    const declarations = rule('.settings-page');

    expect(declarations).toContain('overflow-y: auto');
    expect(declarations).toContain('min-height: 0');
  });

  it('puts its scrollbar at the dialog edge and takes the width back from the right padding, so the content is not pushed in', () => {
    const declarations = rule('.settings-page');

    expect(declarations).toContain('margin-inline-end: calc(var(--space-8) * -1)');
    expect(declarations).toContain('padding-inline: var(--space-24) var(--space-12)');
    expect(declarations).toContain('scrollbar-gutter: stable');
  });

  it('keeps the scroll from chaining to the page behind the dialog', () => {
    expect(rule('.settings-page')).toContain('overscroll-behavior: contain');
  });
});
