import { describe, expect, it } from 'vitest';

import { iconRegistry } from './iconRegistry';
import { systemIconSvg } from './systemIconSvg';

describe('systemIconSvg', () => {
  it('draws the registry icon as svg markup, at AppIcon’s default size', () => {
    const markup = systemIconSvg('tray');

    expect(markup.startsWith('<svg')).toBe(true);
    expect(markup).toContain('width="16"');
    expect(markup).toContain('currentColor');
  });

  it('gives each icon its own markup, and the same markup every time', () => {
    expect(systemIconSvg('tray')).not.toBe(systemIconSvg('archive'));
    expect(systemIconSvg('folder')).toBe(systemIconSvg('folder'));
  });

  it('can draw every icon in the registry', () => {
    for (const icon of Object.keys(iconRegistry) as (keyof typeof iconRegistry)[]) {
      expect(systemIconSvg(icon)).toContain('<svg');
    }
  });
});
