import { useState, type CSSProperties } from 'react';
import './GradientGrainy.css';

interface Palette {
  /** The flat colour behind the blobs. */
  readonly bg: string;
  /** Three blob colours: a bright core, a mid tone and a soft accent. */
  readonly blobs: readonly [string, string, string];
}

/**
 * The palettes a gradient can take: soft glows over a flat colour, like the blurred gradients stock sites
 * sell. The colours are the artwork, not the theme — they are the same in light and dark.
 */
const PALETTES = {
  peach: { bg: '#ffd9b8', blobs: ['#e5392f', '#ff8a1f', '#ffb347'] },
  iris: { bg: '#d6c8fb', blobs: ['#5b50ee', '#2b25ad', '#17107a'] },
  nebula: { bg: '#fbe6f3', blobs: ['#0f6bff', '#a259d9', '#2a1f8f'] },
  magenta: { bg: '#f9b5c4', blobs: ['#ff2d95', '#ff7aa8', '#ffc2a0'] },
} as const satisfies Record<string, Palette>;

export type GradientGrainyPalette = keyof typeof PALETTES;
export const GRADIENT_GRAINY_PALETTES = Object.keys(
  PALETTES
) as GradientGrainyPalette[];

interface GradientGrainyProps {
  /** A fixed palette. Absent, one is picked at random each time the component mounts. */
  palette?: GradientGrainyPalette;
  className?: string;
}

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** `#rrggbb` as the `r g b` triple `rgb(r g b / alpha)` takes, so the CSS can fade a colour out. */
function rgbTriple(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Where each blob sits, how big it is and how out of step it moves — random, so no two looks match. */
function randomBlobs(colours: Palette['blobs']): CSSProperties[] {
  const blobs = colours.map((colour, index) => ({
    '--gg-rgb': rgbTriple(colour),
    '--gg-x': `${between(index === 0 ? 20 : 0, index === 0 ? 80 : 100).toFixed(1)}%`,
    '--gg-y': `${between(index === 0 ? 20 : 0, index === 0 ? 80 : 100).toFixed(1)}%`,
    '--gg-size': `${between(55, 95).toFixed(0)}vmax`,
    '--gg-duration': `${between(9, 16).toFixed(1)}s`,
    '--gg-delay': `-${between(0, 12).toFixed(1)}s`,
  }));

  // How stretched each blob starts, so the three are not the same ellipse.
  return blobs.map((blob) => ({
    ...blob,
    '--gg-aspect': between(0.8, 1.3).toFixed(2),
  })) as CSSProperties[];
}

function randomLook(palette?: GradientGrainyPalette) {
  const name =
    palette ??
    GRADIENT_GRAINY_PALETTES[
      Math.floor(Math.random() * GRADIENT_GRAINY_PALETTES.length)
    ]!;
  const { bg, blobs } = PALETTES[name];

  return {
    name,
    style: { '--gg-bg': bg } as CSSProperties,
    blobs: randomBlobs(blobs),
  };
}

/**
 * A soft gradient with a fine film grain over it: three large colour blobs on a flat colour, each slowly
 * drifting, turning and stretching from one organic shape to another. Palette and blob positions are random per
 * mount (and then stay put while it is shown). A decorative background layer — it fills its nearest positioned
 * ancestor, clips its own overflow, and never takes a click.
 *
 * Built to cost almost nothing to run: the blobs' softness is painted into their gradients (no blur filter), and
 * they are moved only with `transform`, so the browser animates them on the compositor with no style
 * recalculation, layout or repaint per frame; the grain is a still image with no blend mode. Pure CSS (no canvas,
 * no packages). The motion stops for users who prefer reduced motion, which leaves a still arrangement of the
 * same blobs.
 */
export function GradientGrainy({ palette, className }: GradientGrainyProps) {
  const [look] = useState(() => randomLook(palette));

  return (
    <div
      className={['gradient-grainy', className].filter(Boolean).join(' ')}
      data-palette={look.name}
      style={look.style}
      aria-hidden="true"
    >
      {look.blobs.map((style, index) => (
        <div key={index} className="gradient-grainy__blob" style={style} />
      ))}
      <div className="gradient-grainy__grain" />
    </div>
  );
}
