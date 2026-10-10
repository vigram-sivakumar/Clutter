// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

afterEach(cleanup);

describe('MenuItem label', () => {
  it('wraps a plain-text label in .menu__item-label inside the row content', () => {
    const { getByRole } = render(
      <Menu>
        <MenuItem trailing={<span>Default</span>}>A very long template name</MenuItem>
      </Menu>
    );

    const label = getByRole('menuitem').querySelector('.entry__content > .menu__item-label');
    expect(label?.textContent).toBe('A very long template name');
    // The trailing metadata is a sibling slot, not part of the label.
    expect(getByRole('menuitem').querySelector('.entry__meta')?.textContent).toBe('Default');
  });

  it('renders custom element content exactly as given — no wrapper', () => {
    const { getByRole } = render(
      <Menu>
        <MenuItem>
          <span className="custom-suggestion">
            #tag <span className="detail">detail</span>
          </span>
        </MenuItem>
      </Menu>
    );

    const content = getByRole('menuitem').querySelector('.entry__content')!;
    expect(content.children).toHaveLength(1);
    expect(content.firstElementChild).toHaveClass('custom-suggestion');
    expect(content.querySelector('.menu__item-label')).toBeNull();
  });

  it('truncation lives in MenuItem.css, scoped to the menu label', () => {
    const css = readFileSync(join(__dirname, 'MenuItem.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.menu__item-label\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});
