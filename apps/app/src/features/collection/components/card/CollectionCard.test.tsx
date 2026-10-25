// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionCard } from './CollectionCard';

afterEach(cleanup);

const card = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('CollectionCard — slots', () => {
  it('renders media beside one main section holding the header and the content, and nothing for an absent part', () => {
    const { container } = render(
      <CollectionCard header={<h3>head</h3>} media={<img alt="" data-testid="media" />}>
        <p>body</p>
      </CollectionCard>
    );

    const root = card(container);
    expect(root.querySelector('.collection-card__media [data-testid="media"]')).not.toBeNull();
    expect(root.querySelector('.collection-card__main .collection-card__header')).toHaveTextContent('head');
    expect(root.querySelector('.collection-card__main .collection-card__content')).toHaveTextContent('body');

    cleanup();
    const { container: bare } = render(<CollectionCard header="only" />);
    expect(bare.querySelector('.collection-card__media')).toBeNull();
    expect(bare.querySelector('.collection-card__content')).toBeNull();

    cleanup();
    const { container: mediaOnly } = render(<CollectionCard media="m" />);
    expect(mediaOnly.querySelector('.collection-card__main')).toBeNull();
  });

  it('knows nothing about what a slot holds — any node goes in', () => {
    render(
      <CollectionCard header="h" media={<canvas data-testid="c" />} divider={<hr data-testid="d" />}>
        <svg data-testid="s" />
      </CollectionCard>
    );

    expect(screen.getByTestId('c')).toBeInTheDocument();
    expect(screen.getByTestId('d')).toBeInTheDocument();
    expect(screen.getByTestId('s')).toBeInTheDocument();
  });
});

describe('CollectionCard — structure', () => {
  const order = (root: HTMLElement) =>
    [...root.children].map((child) => child.className.replace(/collection-card__(\w+).*/, '$1'));
  const mainOrder = (root: HTMLElement) =>
    [...root.querySelector('.collection-card__main')!.children].map((child) => child.className.split(' ')[0]);

  it('has two top-level parts, media then main — and the main holds header, divider, content in that order', () => {
    const { container } = render(
      <CollectionCard header="h" media="m" divider={<hr className="rule" />}>
        c
      </CollectionCard>
    );

    expect(order(card(container))).toEqual(['media', 'main']);
    expect(mainOrder(card(container))).toEqual(['collection-card__header', 'rule', 'collection-card__content']);
  });

  it('draws the divider only between a header and content: not with one of them missing', () => {
    const divider = <hr data-testid="d" />;

    const { container: noContent } = render(<CollectionCard header="h" divider={divider} />);
    expect(noContent.querySelector('[data-testid="d"]')).toBeNull();
    cleanup();
    const { container: noHeader } = render(<CollectionCard divider={divider}>c</CollectionCard>);
    expect(noHeader.querySelector('[data-testid="d"]')).toBeNull();
  });

  it('showContent={false} hides the content and with it the divider', () => {
    const { container } = render(
      <CollectionCard header="h" divider={<hr data-testid="d" />} showContent={false}>
        c
      </CollectionCard>
    );

    expect(container.querySelector('.collection-card__content')).toBeNull();
    expect(container.querySelector('[data-testid="d"]')).toBeNull();
    expect(container.querySelector('.collection-card__header')).not.toBeNull();
    expect(container.querySelector('.collection-card__main--content')).toBeNull();
  });

  it('showDivider={false} hides only the divider', () => {
    const { container } = render(
      <CollectionCard header="h" divider={<hr data-testid="d" />} showDivider={false}>
        c
      </CollectionCard>
    );

    expect(container.querySelector('[data-testid="d"]')).toBeNull();
    expect(container.querySelector('.collection-card__content')).toHaveTextContent('c');
  });

  it('marks the main section as holding content (it then has no bottom padding and fills the card)', () => {
    const { container, rerender } = render(<CollectionCard header="h" />);
    expect(container.querySelector('.collection-card__main')).not.toHaveClass('collection-card__main--content');

    rerender(<CollectionCard header="h">c</CollectionCard>);
    expect(container.querySelector('.collection-card__main')).toHaveClass('collection-card__main--content');
  });

  it('sets the media height only when given one', () => {
    const { container, rerender } = render(<CollectionCard media="m" />);
    expect(card(container).style.getPropertyValue('--collection-card-media-height')).toBe('');

    rerender(<CollectionCard media="m" mediaHeight="100%" />);
    expect(card(container).style.getPropertyValue('--collection-card-media-height')).toBe('100%');
  });

  it('is not empty by default; isEmpty marks the quiet "add something" card and keeps its content', () => {
    const { container, rerender } = render(<CollectionCard>+</CollectionCard>);
    expect(card(container)).not.toHaveClass('collection-card--empty');

    rerender(<CollectionCard isEmpty>+</CollectionCard>);
    expect(card(container)).toHaveClass('collection-card--empty');
    expect(container.querySelector('.collection-card__content')).toHaveTextContent('+');
  });

  it('has no layout or tone prop any more', () => {
    const { container } = render(<CollectionCard header="h" />);

    expect(card(container).className).not.toMatch(/tone|layout/);
  });
});

describe('CollectionCard — shape and state', () => {
  it('has a fixed aspect ratio only when given one (a number, or a CSS ratio)', () => {
    const { container, rerender } = render(<CollectionCard header="h" />);
    expect(card(container).style.aspectRatio).toBe('');

    rerender(<CollectionCard header="h" aspectRatio={0.75} />);
    // a bare number is a ratio to 1
    expect(card(container).style.aspectRatio).toBe('0.75 / 1');

    rerender(<CollectionCard header="h" aspectRatio="3 / 4" />);
    expect(card(container).style.aspectRatio).toBe('3 / 4');
  });

  it('keeps a caller style alongside the aspect ratio', () => {
    const { container } = render(<CollectionCard header="h" aspectRatio="4 / 5" style={{ opacity: 0.5 }} />);

    expect(card(container).style.aspectRatio).toBe('4 / 5');
    expect(card(container).style.opacity).toBe('0.5');
  });

  it('marks a selected card', () => {
    const { container, rerender } = render(<CollectionCard header="h" />);
    expect(card(container)).not.toHaveClass('collection-card--selected');

    rerender(<CollectionCard header="h" isSelected />);
    expect(card(container)).toHaveClass('collection-card--selected');
  });

  it('forwards its ref, className and attributes to the card element', () => {
    const ref = { current: null as HTMLDivElement | null };
    const { container } = render(
      <CollectionCard ref={ref} header="h" className="mine" data-id="n1" aria-label="Plan" />
    );

    expect(ref.current).toBe(card(container));
    expect(card(container)).toHaveClass('collection-card', 'mine');
    expect(card(container)).toHaveAttribute('data-id', 'n1');
    expect(card(container)).toHaveAttribute('aria-label', 'Plan');
  });
});

describe('CollectionCard — interaction', () => {
  it('is inert without onClick: no role, no tabIndex, no keyboard activation', () => {
    const { container } = render(<CollectionCard header="h" />);
    const root = card(container);

    expect(root).not.toHaveAttribute('role');
    expect(root).not.toHaveAttribute('tabindex');
    expect(() => fireEvent.keyDown(root, { key: 'Enter' })).not.toThrow();
  });

  it('with onClick it is one focusable button', () => {
    const { container } = render(<CollectionCard header="h" onClick={() => {}} />);

    expect(card(container)).toHaveAttribute('role', 'button');
    expect(card(container)).toHaveAttribute('tabindex', '0');
  });

  it('opens on click and on Enter / Space on the card itself', () => {
    const onClick = vi.fn();
    const { container } = render(<CollectionCard header="h" onClick={onClick} />);

    fireEvent.click(card(container));
    fireEvent.keyDown(card(container), { key: 'Enter' });
    fireEvent.keyDown(card(container), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('does not open for a key pressed inside a descendant', () => {
    const onClick = vi.fn();
    render(
      <CollectionCard header="h" onClick={onClick}>
        <span data-testid="inner">x</span>
      </CollectionCard>
    );

    fireEvent.keyDown(screen.getByTestId('inner'), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a nested interactive element keeps its own click and never opens the card', () => {
    const onClick = vi.fn();
    const onNested = vi.fn();
    render(
      <CollectionCard header="h" onClick={onClick}>
        <button type="button" onClick={onNested}>Inner</button>
      </CollectionCard>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inner' }));
    expect(onNested).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('CollectionCard.css', () => {
  const css = readFileSync(join(__dirname, 'CollectionCard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('never uses margin (CLAUDE.md)', () => {
    expect(css).not.toMatch(/\bmargin/);
  });

  it('only a card that opens something gets the pointer cursor', () => {
    expect(css).toMatch(/\.collection-card\[role='button'\]\s*\{\s*cursor:\s*pointer/);
  });

  it('centres the content of an empty card', () => {
    expect(css).toMatch(
      /\.collection-card--empty \.collection-card__content\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/
    );
  });

  it('positions nothing over anything else but the hover corner: no other absolute positioning, no scrim', () => {
    expect(css.replace(/\.collection-card__selection\s*\{[^}]*\}/, '')).not.toMatch(/position:\s*absolute/);
    expect(css).not.toMatch(/gradient/);
  });

  it('the main section carries the one padding and the one gap between its children', () => {
    expect(css).toMatch(/\.collection-card__main\s*\{[^}]*padding:\s*var\(--collection-card-inset\)[^}]*gap:\s*var\(--collection-card-inset\)/);
    expect(css).toMatch(/\.collection-card__main--content\s*\{[^}]*padding-bottom:\s*0/);
  });
});
