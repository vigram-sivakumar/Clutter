import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CSS-source only (jsdom computes no layout, and no :hover), the same convention the other CSS tests use.
describe('Sidebar.css — count badges shown on sidebar hover', () => {
  const css = readFileSync(join(__dirname, 'Sidebar.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = (selector: string) => {
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectors]) =>
      selectors!.split(',').some((candidate) => candidate.trim() === selector)
    );
    expect(rule, `no rule for ${selector}`).toBeDefined();
    return rule![2]!;
  };

  it('hides a marked badge by default', () => {
    expect(declarations('.sidebar .count-badge--on-sidebar-hover')).toMatch(/opacity:\s*0\s*;/);
  });

  it('shows it while the sidebar — not an individual row — is hovered, and while keyboard focus is inside it', () => {
    expect(declarations('.sidebar:hover .count-badge--on-sidebar-hover')).toMatch(/opacity:\s*1\s*;/);
    expect(declarations('.sidebar:has(:focus-visible) .count-badge--on-sidebar-hover')).toMatch(/opacity:\s*1\s*;/);
    expect(css).not.toMatch(/\.entry:hover[^{]*count-badge--on-sidebar-hover/);
  });

  it('never keys visibility on plain focus or selection, so a click (which leaves the row focused) cannot pin the badges', () => {
    const badgeSelectors = [...css.matchAll(/([^{}]+)\{/g)]
      .flatMap(([, selectors]) => selectors!.split(','))
      .map((selector) => selector.trim())
      .filter((selector) => selector.includes('count-badge--on-sidebar-hover'));

    expect(badgeSelectors.length).toBeGreaterThan(0);
    for (const selector of badgeSelectors) {
      expect(selector).not.toMatch(/:focus-within|:focus(?!-visible)|selected|active|--selected/);
    }
  });

  it('changes only opacity (and its transition): never layout, so a row cannot shift or truncate differently', () => {
    for (const selector of ['.sidebar .count-badge--on-sidebar-hover', '.sidebar:hover .count-badge--on-sidebar-hover']) {
      const properties = declarations(selector)
        .split(';')
        .map((declaration) => declaration.split(':')[0]!.trim())
        .filter(Boolean);

      expect(properties.every((property) => property === 'opacity' || property === 'transition')).toBe(true);
    }
  });
});
