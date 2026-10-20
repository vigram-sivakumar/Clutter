// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GRADIENT_GRAINY_PALETTES, GradientGrainy } from './GradientGrainy';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const root = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement;

describe('GradientGrainy', () => {
  it('is a decorative background: hidden from assistive tech, three blobs and a grain layer, no content', () => {
    const { container } = render(<GradientGrainy />);

    expect(root(container)).toHaveClass('gradient-grainy');
    expect(root(container)).toHaveAttribute('aria-hidden', 'true');
    expect(
      [...root(container).children].map((layer) => layer.className)
    ).toEqual([
      'gradient-grainy__blob',
      'gradient-grainy__blob',
      'gradient-grainy__blob',
      'gradient-grainy__grain',
    ]);
    expect(root(container).textContent).toBe('');
    expect(
      root(container).querySelector('a, button, input, [tabindex]')
    ).toBeNull();
  });

  it('adds a caller’s class to its own', () => {
    const { container } = render(<GradientGrainy className="mine" />);

    expect(root(container)).toHaveClass('gradient-grainy', 'mine');
  });

  it('uses the palette it is given: its flat colour behind its three blob colours', () => {
    const { container } = render(<GradientGrainy palette="peach" />);

    expect(root(container)).toHaveAttribute('data-palette', 'peach');
    expect(root(container).style.getPropertyValue('--gg-bg')).toBe('#ffd9b8');
    const colours = [
      ...root(container).querySelectorAll<HTMLElement>(
        '.gradient-grainy__blob'
      ),
    ].map((blob) => blob.style.getPropertyValue('--gg-rgb'));
    // `rgb(r g b / alpha)` triples of #e5392f, #ff8a1f, #ffb347
    expect(colours).toEqual(['229 57 47', '255 138 31', '255 179 71']);
  });

  it('picks any of its palettes at random when not given one', () => {
    const seen = new Set<string>();
    GRADIENT_GRAINY_PALETTES.forEach((_name, index) => {
      vi.spyOn(Math, 'random').mockReturnValue(
        index / GRADIENT_GRAINY_PALETTES.length + 0.001
      );
      const { container } = render(<GradientGrainy />);
      seen.add(root(container).getAttribute('data-palette')!);
      cleanup();
    });

    expect(GRADIENT_GRAINY_PALETTES.length).toBeGreaterThan(3);
    expect([...seen].sort()).toEqual([...GRADIENT_GRAINY_PALETTES].sort());
  });

  it('places the blobs randomly, within the frame, and differently each time', () => {
    const looks = [0.1, 0.9].map((random) => {
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const { container } = render(<GradientGrainy palette="peach" />);
      const blob = container.querySelector<HTMLElement>(
        '.gradient-grainy__blob'
      )!;
      const look = [
        '--gg-x',
        '--gg-y',
        '--gg-size',
        '--gg-duration',
        '--gg-delay',
      ].map((name) => blob.style.getPropertyValue(name));
      cleanup();
      return look;
    });

    expect(looks[0]).not.toEqual(looks[1]);
    for (const look of looks) {
      expect(parseFloat(look[0]!)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(look[0]!)).toBeLessThanOrEqual(100);
      expect(parseFloat(look[1]!)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(look[1]!)).toBeLessThanOrEqual(100);
      expect(look[4]!.startsWith('-')).toBe(true); // a negative delay starts it mid-drift, out of step
    }
  });

  it('keeps its look while it stays mounted (a re-render does not reshuffle it)', () => {
    const { container, rerender } = render(<GradientGrainy />);
    const before = root(container).outerHTML;

    rerender(<GradientGrainy className="x" />);

    expect(root(container).outerHTML.replace(' x', '')).toBe(before);
  });
});

describe('GradientGrainy CSS stays cheap to run', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/gradient-grainy/GradientGrainy.css'),
    'utf8'
  );
  const keyframes = css.slice(css.indexOf('@keyframes'), css.indexOf('@media'));

  it('moves the blobs only with transform: nothing in the animation forces a repaint or a layout', () => {
    const animated = [...keyframes.matchAll(/^\s+([a-z-]+):/gm)].map(
      (m) => m[1]
    );

    expect(animated.length).toBeGreaterThan(0);
    expect(new Set(animated)).toEqual(new Set(['transform']));
  });

  it('has no blur filter, no blend mode and no animated border-radius (the costly parts of the first version)', () => {
    expect(css).not.toMatch(/filter\s*:/);
    expect(css).not.toMatch(/blur\(/);
    expect(css).not.toMatch(/mix-blend-mode/);
    expect(css).not.toMatch(/border-radius/);
  });

  it('stops the motion for reduced motion, leaving the still blobs and grain', () => {
    const reduced = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)')
    );

    expect(reduced).toMatch(/\.gradient-grainy__blob\s*\{\s*animation:\s*none/);
  });
});

describe('GradientGrainy blob stretch', () => {
  it('gives every blob its own starting aspect ratio, within a modest range', () => {
    const { container } = render(<GradientGrainy palette="iris" />);

    const aspects = [
      ...container.querySelectorAll<HTMLElement>('.gradient-grainy__blob'),
    ].map((blob) => parseFloat(blob.style.getPropertyValue('--gg-aspect')));
    expect(aspects).toHaveLength(3);
    for (const aspect of aspects) {
      expect(aspect).toBeGreaterThanOrEqual(0.8);
      expect(aspect).toBeLessThanOrEqual(1.3);
    }
  });
});

describe('GradientGrainy iris palette', () => {
  const channels = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  it('is one of the palettes, pale lilac behind periwinkle, indigo and deep indigo blobs', () => {
    expect(GRADIENT_GRAINY_PALETTES).toContain('iris');
    const { container } = render(<GradientGrainy palette="iris" />);

    expect(root(container)).toHaveAttribute('data-palette', 'iris');
    expect(root(container).style.getPropertyValue('--gg-bg')).toBe('#d6c8fb');
    const colours = [
      ...root(container).querySelectorAll<HTMLElement>(
        '.gradient-grainy__blob'
      ),
    ].map((blob) => blob.style.getPropertyValue('--gg-rgb'));
    expect(colours).toEqual(['91 80 238', '43 37 173', '23 16 122']);
  });

  it('stays lavender and indigo: every colour is blue-dominant and blue is never below violet’s red (no orange, no teal)', () => {
    for (const hex of ['#d6c8fb', '#5b50ee', '#2b25ad', '#17107a']) {
      const { r, g, b } = channels(hex);
      expect(b).toBeGreaterThan(r); // blue leads: not orange or warm
      expect(b).toBeGreaterThan(g); // blue leads green: not teal
      expect(r).toBeGreaterThanOrEqual(g); // red at least green: violet side of blue, not cyan
    }
  });

  it('goes light to dark: the blobs get progressively deeper than the lilac behind them', () => {
    const luminance = (hex: string) => {
      const { r, g, b } = channels(hex);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [bg, periwinkle, indigo, deep] = [
      '#d6c8fb',
      '#5b50ee',
      '#2b25ad',
      '#17107a',
    ].map(luminance);

    expect(bg!).toBeGreaterThan(periwinkle!);
    expect(periwinkle!).toBeGreaterThan(indigo!);
    expect(indigo!).toBeGreaterThan(deep!);
  });
});

describe('GradientGrainy nebula palette', () => {
  it('is one of the palettes: a pale pink-white glow behind electric blue, orchid purple and deep indigo', () => {
    expect(GRADIENT_GRAINY_PALETTES).toContain('nebula');
    const { container } = render(<GradientGrainy palette="nebula" />);

    expect(root(container)).toHaveAttribute('data-palette', 'nebula');
    expect(root(container).style.getPropertyValue('--gg-bg')).toBe('#fbe6f3');
    const colours = [
      ...root(container).querySelectorAll<HTMLElement>(
        '.gradient-grainy__blob'
      ),
    ].map((blob) => blob.style.getPropertyValue('--gg-rgb'));
    expect(colours).toEqual(['15 107 255', '162 89 217', '42 31 143']);
  });
});

describe('GradientGrainy leaves nothing running behind it', () => {
  it('leaves none of its elements behind when unmounted', () => {
    const { unmount } = render(<GradientGrainy palette="iris" />);
    expect(document.querySelector('.gradient-grainy')).not.toBeNull();

    unmount();

    expect(document.querySelector('[class*="gradient-grainy"]')).toBeNull();
    expect(document.getAnimations?.() ?? []).toHaveLength(0);
  });

  it('has no effects, timers, frame loops, listeners or observers of its own to leave behind', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/gradient-grainy/GradientGrainy.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/useEffect|useLayoutEffect|useInsertionEffect/);
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(source).not.toMatch(/addEventListener|Observer/);
  });
});
