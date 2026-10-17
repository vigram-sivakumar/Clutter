import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * jsdom doesn't evaluate :hover / :focus-within / :has(), so the reveal rules for the extra-controls slot
 * (a Daily Note's calendar button) are pinned at the stylesheet. The behavior itself was checked in a real
 * browser: hidden at rest, revealed by focus, kept up while the calendar is open.
 */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const controlsCss = read('PageHeaderControls.css');
const titleSectionCss = read('Page.TitleSection.css');

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `rule for ${selector}`).not.toBeNull();
  return match![1]!;
}

describe('the extra-controls slot follows the More actions button visibility', () => {
  it('is hidden and inert at rest', () => {
    const rule = block(controlsCss, '.page-header-controls__extra');
    expect(rule).toMatch(/opacity:\s*0\s*;/);
    expect(rule).toMatch(/pointer-events:\s*none\s*;/);
  });

  it('is revealed by hovering the title section, in the rule that owns that hover surface', () => {
    expect(titleSectionCss).toMatch(
      /\.page-title-section:hover \.page-header-controls__menu,\s*\.page-title-section:hover \.page-header-controls__extra\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/
    );
  });

  it('both buttons stay visible while either menu in the row is open, and the slot while it has focus', () => {
    const match = controlsCss.match(
      /\.page-header-controls\[data-menu-open\] \.page-header-controls__menu,\s*\.page-header-controls\[data-menu-open\] \.page-header-controls__extra,\s*\.page-header-controls__extra:focus-within\s*\{([^}]*)\}/
    );
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/opacity:\s*1\s*;/);
    expect(match![1]).toMatch(/pointer-events:\s*auto\s*;/);
  });

  it('does not change the visibility rules of the other controls', () => {
    expect(block(controlsCss, '.page-header-controls__menu')).toMatch(/opacity:\s*0\s*;/);
    expect(controlsCss).toMatch(/\.page-header-controls__menu\[aria-expanded='true'\]\s*\{[^}]*opacity:\s*1/);
    expect(block(controlsCss, '.page-header-controls')).not.toMatch(/opacity/);
  });
});
