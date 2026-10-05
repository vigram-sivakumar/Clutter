/**
 * TEMPORARY — NoteCard scaling experiment. DEV ONLY.
 *
 * A full-window overlay (toggle: Cmd/Ctrl+Shift+K, or open the app with
 * `?cardScaleLab`) that renders ONE representative, unmodified NoteCard at many
 * sizes using the canonical-card + scale-factor model (ScaledCard): the card
 * lays out at a fixed 240px design width and the whole composition is
 * transform-scaled. Nothing inside is resized independently. A production
 * (unscaled) NoteCard is shown first as the reference.
 *
 * Experiment only — not wired into NoteCard, the Collection view, the
 * template picker or DocumentPreview. DELETE this file, CardScaleLab.css and
 * the mount in mountDevLab.tsx when the decision is made.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CollectionCard } from '@features/collection/components/card/CollectionCard';
import { CardTitleSection } from '@features/collection/components/card/CardTitleSection';
import { PageCanvasPreview } from '@features/collection/components/note/card/PageCanvasPreview';
import { renderMarkdownBlocks } from '@features/markdown/render/renderMarkdownBlocks';
import {
  PropertyList,
  type PropertyListItem,
} from '@components/property-list/PropertyList';
import { NoteCard } from '@features/collection/components/note/card/NoteCard';
import type { DocumentPreviewResolvers } from '@features/collection/components/note/card/DocumentPreview';
import {
  CARD_DESIGN_WIDTH,
  ScaledCard,
} from '@features/collection/components/card/ScaledCard';

import './CardScaleLab.css';

const MARKDOWN = `# Weekly Meeting

A short intro paragraph that explains what this note is about and why it exists, long enough to wrap onto a second line.

## Agenda

- Discuss the roadmap
- Review milestones
  - Q3 launch
  - Q4 planning
- Open questions

- [ ] Send the notes
- [x] Book the room

| Owner | Item |
| --- | --- |
| Sam | Roadmap |

> A quoted line of text.

Closing paragraph with **bold**, *italic* and \`inline code\`.
`;

const COVER_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6aa6ff'/><stop offset='1' stop-color='#c58bff'/></linearGradient></defs><rect width='600' height='200' fill='url(#g)'/><circle cx='460' cy='70' r='46' fill='rgba(255,255,255,.55)'/></svg>`
  );

const PHOTO_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='360'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffb86b'/><stop offset='1' stop-color='#ff6b8b'/></linearGradient></defs><rect width='600' height='360' fill='url(#s)'/><circle cx='130' cy='110' r='48' fill='rgba(255,255,255,.7)'/><path d='M0 360 L180 190 L300 280 L430 150 L600 300 L600 360Z' fill='#2f3b52'/></svg>`
  );

const RESOLVERS: DocumentPreviewResolvers = {
  resolveCoverImage: () => COVER_SVG,
  resolveEmbedImage: (path) => ({
    status: 'image',
    url: PHOTO_SVG,
    copyUrl: path,
    alt: path,
  }),
  resolveImageSrc: (path) => ({
    status: 'resolved',
    url: PHOTO_SVG,
    copyUrl: path,
  }),
};

const IMAGE_MARKDOWN = `# Trip photos

A short intro paragraph above the embedded image.

![[summit.png]]

Text between images, then a standard Markdown image:

![Sunset](sunset.png)

- A list after the images
- Another item
`;

const PROPERTY_ITEMS: PropertyListItem[] = [
  { name: 'Tags', type: 'tag', value: ['work', 'meetings'], editable: false },
  {
    name: 'Aliases',
    type: 'multi-select',
    value: ['Weekly sync'],
    editable: false,
  },
  { name: 'Due', type: 'date', value: '2026-10-12', editable: false },
  {
    name: 'Link',
    type: 'url',
    value: 'https://example.com/agenda',
    editable: false,
  },
  { name: 'Attendees', type: 'number', value: 6, editable: false },
  { name: 'Reviewed', type: 'boolean', value: true, editable: false },
  { name: 'Owner', type: 'text', value: 'Sam', editable: false },
];

const COMPOSITIONS = [
  {
    id: 'cover-text',
    label: 'Cover + text',
    markdown: MARKDOWN,
    cover: true,
  },
  {
    id: 'cover-image',
    label: 'Cover + embedded image',
    markdown: IMAGE_MARKDOWN,
    cover: true,
  },
  {
    id: 'image',
    label: 'No cover + embedded image',
    markdown: IMAGE_MARKDOWN,
    cover: false,
  },
  {
    id: 'text',
    label: 'No cover + text',
    markdown: MARKDOWN,
    cover: false,
  },
  {
    id: 'cover-props',
    label: 'Cover + properties + text',
    markdown: MARKDOWN,
    cover: true,
    properties: true,
  },
  {
    id: 'props',
    label: 'Properties + text (no cover)',
    markdown: MARKDOWN,
    cover: false,
    properties: true,
  },
] as const;

type Composition = (typeof COMPOSITIONS)[number];

const SCALES = [
  { label: '100% / large', scale: 1 },
  { label: '75%', scale: 0.75 },
  { label: '50%', scale: 0.5 },
  { label: '40%', scale: 0.4 },
  { label: '32%', scale: 0.32 },
  { label: '24%', scale: 0.24 },
];

const WIDTHS = [250, 200, 165, 128, 96, 64, 48, 32];

type Mode = 'whole' | 'split' | 'canvas';

const CANVAS_WIDTH = 600;

/**
 * Lab-only: the page's PropertyList on its own fixed 600px canvas, scaled to the
 * card width the way DocumentPreview scales the body (same formula). Sits between
 * the cover and the content, the order a note's page has them.
 */
function ScaledProperties() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) {
      return;
    }
    const measure = () => {
      const style = getComputedStyle(viewport);
      const available =
        viewport.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      if (available > 0) {
        const next = available / CANVAS_WIDTH;
        setScale(next);
        setHeight(canvas.offsetHeight * next);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      className="card-scale-lab__props"
      aria-hidden="true"
      style={{ height, visibility: scale === null ? 'hidden' : 'visible' }}
    >
      <div
        ref={canvasRef}
        className="card-scale-lab__props-canvas"
        style={{ width: CANVAS_WIDTH, transform: `scale(${scale ?? 1})` }}
      >
        <PropertyList items={PROPERTY_ITEMS} />
      </div>
    </div>
  );
}

/**
 * Lab-only: HEADER unscaled, CONTENT scaled. The header is the normal
 * CardTitleSection at real pixel sizes, outside any transform. Below it, one
 * canonical 600px page canvas — cover (240px, the page's own default cover
 * height), optional property list, body — scaled as a single unit by
 * (available width / 600). Reuses DocumentPreview.css (viewport/clip/fade and
 * the block typography) but not its component, since that scales only the body.
 */
function SplitCard({
  composition,
  showHeader = true,
}: {
  composition: Composition;
  showHeader?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const imageNote = composition.markdown === IMAGE_MARKDOWN;
  const body = renderMarkdownBlocks(composition.markdown, RESOLVERS);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const measure = () => {
      const style = getComputedStyle(viewport);
      const available =
        viewport.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      if (available > 0) {
        setScale(available / CANVAS_WIDTH);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <CollectionCard className="note-card">
      {showHeader && (
        <CardTitleSection
          className="note-card__header"
          icon="note"
          emoji={imageNote ? '🏔️' : '📅'}
          title={imageNote ? 'Trip photos' : 'Weekly Meeting'}
          description={imageNote ? 'Summit weekend' : 'Team sync notes'}
          metadata={<span>Edited Oct 5</span>}
          metadataLayout="vertical"
        />
      )}
      <div
        ref={viewportRef}
        className={`document-preview card-scale-lab__split-viewport${showHeader ? '' : ' card-scale-lab__split-viewport--no-header'}`}
        aria-hidden="true"
      >
        <div
          className="document-preview__canvas"
          style={
            scale === null
              ? { visibility: 'hidden' }
              : ({ '--document-preview-scale': scale } as React.CSSProperties)
          }
        >
          {composition.cover && (
            <img
              className="card-scale-lab__split-cover"
              src={COVER_SVG}
              alt=""
              draggable={false}
            />
          )}
          {'properties' in composition && (
            <PropertyList items={PROPERTY_ITEMS} />
          )}
          <div className="document-preview__body">{body}</div>
        </div>
      </div>
    </CollectionCard>
  );
}

/** Lab-only: a note card with the page's property list between cover and content (NoteCard has no such section). */
function PropertyCard({ composition }: { composition: Composition }) {
  return (
    <CollectionCard className="note-card">
      <CardTitleSection
        className="note-card__header"
        icon="note"
        emoji="📅"
        title="Weekly Meeting"
        description="Team sync notes"
        metadata={<span>Edited Oct 5</span>}
        metadataLayout="vertical"
      />
      <ScaledProperties />
      <PageCanvasPreview
        markdown={composition.markdown}
        resolvers={RESOLVERS}
      />
    </CollectionCard>
  );
}

function RepresentativeCard({
  composition,
  mode,
}: {
  composition: Composition;
  mode: Mode;
}) {
  if (mode !== 'whole') {
    return (
      <SplitCard composition={composition} showHeader={mode === 'split'} />
    );
  }
  if ('properties' in composition) {
    return <PropertyCard composition={composition} />;
  }
  const imageNote = composition.markdown === IMAGE_MARKDOWN;
  return (
    <NoteCard
      title={imageNote ? 'Trip photos' : 'Weekly Meeting'}
      emoji={imageNote ? '🏔️' : '📅'}
      description={imageNote ? 'Summit weekend' : 'Team sync notes'}
      updated="Oct 5"
      markdown={composition.markdown}
      cover={composition.cover ? 'lab-cover' : undefined}
      previewResolvers={RESOLVERS}
    />
  );
}

function Cell({
  label,
  sub,
  width,
  children,
}: {
  label: string;
  sub: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <figure className="card-scale-lab__cell">
      <figcaption className="card-scale-lab__label">
        <strong>{label}</strong>
        <span>{sub}</span>
      </figcaption>
      {/* `note-card-grid` supplies the cover height + canvas width; `collection-card-grid` the card shape. */}
      <div
        className="collection-card-grid note-card-grid card-scale-lab__frame"
        style={{ width, gridTemplateColumns: '1fr' }}
      >
        {children}
      </div>
    </figure>
  );
}

export function CardScaleLab() {
  const [open, setOpen] = useState(() =>
    new URLSearchParams(window.location.search).has('cardScaleLab')
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [compositionId, setCompositionId] = useState<string>(
    COMPOSITIONS[0].id
  );
  const composition =
    COMPOSITIONS.find((c) => c.id === compositionId) ?? COMPOSITIONS[0];

  const [mode, setMode] = useState<Mode>('whole');
  // Whole-card mode: the unmodified card inside a scaling wrapper. Split mode: header at real size, content scaled (SplitCard).
  const cardAt = () =>
    mode !== 'whole' ? (
      <RepresentativeCard composition={composition} mode={mode} />
    ) : (
      <ScaledCard>
        <RepresentativeCard composition={composition} mode="whole" />
      </ScaledCard>
    );

  const scaleCells = SCALES.map(({ label, scale }) => (
    <Cell
      key={label}
      label={label}
      sub={`${Math.round(CARD_DESIGN_WIDTH * scale)}px wide`}
      width={CARD_DESIGN_WIDTH * scale}
    >
      {cardAt()}
    </Cell>
  ));

  const widthCells = WIDTHS.map((width) => (
    <Cell
      key={width}
      label={`${width}px`}
      sub={`scale ${(width / CARD_DESIGN_WIDTH).toFixed(3)}`}
      width={width}
    >
      {cardAt()}
    </Cell>
  ));

  if (!open) {
    return null;
  }

  return (
    <div className="card-scale-lab">
      <header className="card-scale-lab__header">
        <h2>NoteCard scaling experiment</h2>
        <span>
          Design width {CARD_DESIGN_WIDTH}px · one card, scaled as a whole ·
          Cmd/Ctrl+Shift+K or Esc to close
        </span>
      </header>

      <div className="card-scale-lab__tabs" role="tablist">
        {COMPOSITIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === composition.id}
            onClick={() => setCompositionId(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card-scale-lab__tabs" role="tablist">
        {(
          [
            ['whole', 'Whole card scaled'],
            ['split', 'Header unscaled + content canvas scaled'],
            ['canvas', 'No header — content canvas only'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <h3>Reference — 240px, no scaling wrapper</h3>
      <div className="card-scale-lab__row">
        <Cell
          label="Reference"
          sub={`${CARD_DESIGN_WIDTH}px · 1×, no wrapper`}
          width={CARD_DESIGN_WIDTH}
        >
          <RepresentativeCard composition={composition} mode={mode} />
        </Cell>
      </div>

      <h3>By scale (of the {CARD_DESIGN_WIDTH}px design width)</h3>
      <div className="card-scale-lab__row">{scaleCells}</div>

      <h3>By actual width</h3>
      <div className="card-scale-lab__row">{widthCells}</div>
    </div>
  );
}
