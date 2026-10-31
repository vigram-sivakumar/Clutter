// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CardDivider } from './CardDivider';

afterEach(cleanup);

describe('CardDivider', () => {
  it('is a separator', () => {
    const { container } = render(<CardDivider />);

    const rule = container.firstElementChild!;
    expect(rule).toHaveAttribute('role', 'separator');
    expect(rule).toHaveClass('card-divider');
  });

  it('has no spacing of its own — never margin or padding (the card spaces it), per CLAUDE.md', () => {
    const css = readFileSync(join(__dirname, 'CardDivider.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).not.toMatch(/\bmargin/);
    expect(css).not.toMatch(/\bpadding/);
  });
});
