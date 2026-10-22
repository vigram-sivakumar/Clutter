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

  it('renders custom element content as given, inside the one label wrapper every MenuItem has', () => {
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
    const label = content.querySelector('.menu__item-label')!;
    expect(content.children).toHaveLength(1);
    expect(label.parentElement).toBe(content);
    // The custom content itself is untouched: one element, with its own children, inside the label.
    expect(label.children).toHaveLength(1);
    expect(label.firstElementChild).toHaveClass('custom-suggestion');
    expect(label.querySelector('.detail')?.textContent).toBe('detail');
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

describe('MenuItem danger variant', () => {
  it('renders menu__item--danger, and the default variant does not', () => {
    const { getAllByRole } = render(
      <Menu>
        <MenuItem variant="danger">Remove</MenuItem>
        <MenuItem>Rename</MenuItem>
      </Menu>
    );

    const [danger, plain] = getAllByRole('menuitem');
    expect(danger).toHaveClass('menu__item--danger');
    expect(plain).not.toHaveClass('menu__item--danger');
  });

  it('colors the row with --danger-foreground in MenuItem.css', () => {
    const css = readFileSync(join(__dirname, 'MenuItem.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.menu__item--danger\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/color:\s*var\(--danger-foreground\)/);
  });
});
