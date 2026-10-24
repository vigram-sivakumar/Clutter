import { useCallback, useState, type CSSProperties } from 'react';
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
  iris: { bg: '#d9c8fb', blobs: ['#5b50ee', '#2b25ad', '#17107a'] },
  magenta: { bg: '#f9b5c4', blobs: ['#ff2d95', '#ff7aa8', '#ffc2a0'] },
  sky: { bg: '#e8f3ff', blobs: ['#1d7ae8', '#5fa8f5', '#a9d2fb'] },
  orchid: { bg: '#f2eef3', blobs: ['#9a22b8', '#4e17a6', '#d98bbd'] },
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

/** App-global, the same raw localStorage convention as the other per-device preferences. */
const LAST_PALETTE_KEY = 'clutter-gradient-grainy-last-palette';

function readLastPalette(): GradientGrainyPalette | null {
  try {
    const stored = localStorage.getItem(LAST_PALETTE_KEY);
    return GRADIENT_GRAINY_PALETTES.find((name) => name === stored) ?? null;
  } catch {
    return null;
  }
}

function rememberPalette(name: GradientGrainyPalette): void {
  try {
    localStorage.setItem(LAST_PALETTE_KEY, name);
  } catch {
    // Best-effort: an unwritable store only means the next pick may repeat this one.
  }
}

/** A random palette that is not the one shown last time (so launching twice never looks the same). Only reads. */
function pickPalette(): GradientGrainyPalette {
  const last = readLastPalette();
  const candidates = GRADIENT_GRAINY_PALETTES.filter((name) => name !== last);
  const pool = candidates.length > 0 ? candidates : GRADIENT_GRAINY_PALETTES;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function randomLook(palette?: GradientGrainyPalette) {
  const name = palette ?? pickPalette();
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
 * mount (and then stay put while it is shown). With no `palette`, it picks at random but never the palette shown last time (remembered across launches). A decorative background layer — it fills its nearest positioned
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

  // Remembers the palette that actually mounted (not merely one that was picked: StrictMode picks twice and
  // keeps one). A ref callback rather than an effect; a fixed `palette` is the caller's choice and is left out.
  const remember = useCallback(
    (element: HTMLDivElement | null) => {
      if (element && !palette) rememberPalette(look.name);
    },
    [palette, look.name]
  );

  return (
    <div
      ref={remember}
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
