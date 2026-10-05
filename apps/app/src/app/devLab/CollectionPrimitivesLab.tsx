/**
 * TEMPORARY DESIGN-LAB OVERLAY — DEV ONLY.
 *
 * A full-window layer (toggle: Cmd/Ctrl+Shift+U, or open the app with
 * `?collectionLab`) that renders the new, isolated Collection primitives —
 * CollectionGrid, CollectionCard, CardTitleSection, CollectionRow,
 * CollectionDataList, CollectionDataTable (one CollectionTableCell, three
 * variants), CollectionMedia, ScaledCanvas and the shared activation
 * behavior — with mock data, so they can be looked at and poked before any
 * migration. Nothing here touches the live Collection UI.
 *
 * DELETE this file, CollectionPrimitivesLab.css and its mount in
 * mountDevLab.tsx when the primitives have been reviewed.
 */
import { useEffect, useState, type CSSProperties } from 'react';

import { CollectionGrid } from '@features/collection/primitives/grid/CollectionGrid';
import { CollectionCard } from '@features/collection/primitives/card/CollectionCard';
import { CardTitleSection } from '@features/collection/primitives/card/CardTitleSection';
import { CollectionRow } from '@features/collection/primitives/row/CollectionRow';
import { CollectionDataList, type CollectionDataListItem } from '@features/collection/primitives/list/CollectionDataList';
import {
  CollectionDataTable,
  type CollectionDataTableRow,
} from '@features/collection/primitives/table/CollectionDataTable';
import type { CollectionTableColumn } from '@features/collection/primitives/table/collectionTableColumns';
import { CollectionMedia } from '@features/collection/primitives/media/CollectionMedia';
import { ScaledCanvas } from '@features/collection/primitives/scale/ScaledCanvas';

import './CollectionPrimitivesLab.css';

/** A deterministic gradient "image", so the lab needs no assets. */
const art = (hue: number, label = '') =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 45%)"/>` +
      `<stop offset="1" stop-color="hsl(${(hue + 60) % 360} 65% 30%)"/></linearGradient></defs>` +
      `<rect width="160" height="120" fill="url(#g)"/><text x="80" y="66" text-anchor="middle" font-size="14" fill="white" opacity=".7" font-family="sans-serif">${label}</text></svg>`
  );

const Art = ({ hue, label }: { hue: number; label?: string }) => (
  <img className="cx-lab__thumb" src={art(hue, label)} alt="" draggable={false} />
);

const DOC_WIDTH = 600;
const Doc = () => (
  <div className="cx-lab__doc">
    <h1>Weekly Meeting</h1>
    <p>
      This block is authored at a canonical 600px width and scaled to whatever room it is given, so the
      text wraps exactly the same at every size.
    </p>
    <ul>
      <li>Discuss the roadmap</li>
      <li>Review milestones</li>
      <li>Open questions</li>
    </ul>
  </div>
);

const COLUMNS: CollectionTableColumn[] = [
  { id: 'name', label: 'Name', width: 'minmax(260px, 1fr)' },
  { id: 'preview', label: 'Preview', width: '90px' },
  { id: 'type', label: 'Type', width: '110px' },
  { id: 'created', label: 'Created', width: '130px' },
];

export function CollectionPrimitivesLab() {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('collectionLab'));
  const [min, setMin] = useState(200);
  const [max, setMax] = useState(5);
  const [rowHeight, setRowHeight] = useState(0);
  const [width, setWidth] = useState(100);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['n2']));
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'u') {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) {
    return null;
  }

  const say = (message: string) => setLog((current) => [message, ...current].slice(0, 6));
  const toggle = (id: string) => {
    say(`open ${id}`);
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const stage = { width: `${width}%` } as CSSProperties;

  const listItems: CollectionDataListItem[] = [
    { id: 'l1', icon: 'note', title: 'Weekly Meeting', description: 'Team sync notes', metadata: ['Today', 'Yesterday'], onClick: () => say('open list l1') },
    {
      id: 'l2', emoji: '🌊', title: 'Trip photos', description: 'Summit weekend', metadata: ['12 Aug 2026'], isSelected: true,
      media: { children: <Art hue={200} />, onClick: () => say('media click (row did not open)'), label: 'Change cover' },
      actions: <button type="button" className="cx-lab__action" onClick={() => say('Restore')}>Restore</button>,
      onClick: () => say('open list l2'),
    },
    { id: 'l3', icon: 'note', title: 'Inert row (no onClick)', metadata: ['n/a'] },
  ];

  const tableRows: CollectionDataTableRow[] = [
    {
      id: 't1',
      cells: {
        name: { variant: 'header', icon: 'note', title: 'Weekly Meeting', description: 'Team sync notes' },
        preview: { variant: 'media', children: <Art hue={20} />, onClick: () => say('table media click'), label: 'Change cover' },
        type: { variant: 'text', value: 'Note' },
        created: { variant: 'text', value: 'Today', dateTime: '2026-10-05T10:00:00.000Z' },
      },
      onClick: () => say('open table t1'),
      actions: <button type="button" className="cx-lab__action" onClick={() => say('table Restore')}>Restore</button>,
    },
    {
      id: 't2', isSelected: true,
      cells: {
        name: { variant: 'header', emoji: '🌊', title: 'Trip photos', description: '', descriptionPlaceholder: 'No description' },
        preview: { variant: 'media', children: <Art hue={200} /> },
        type: { variant: 'text', value: 'Image' },
      },
      onClick: () => say('open table t2'),
    },
    { id: 't3', cells: { name: { variant: 'header', icon: 'note', title: 'Inert row', metadata: <span>secondary line</span> } } },
  ];

  return (
    <div className="cx-lab" role="dialog" aria-label="Collection primitives lab">
      <div className="cx-lab__header">
        <h2>Collection primitives</h2>
        <span>isolated · cx- prefix · mock data · Esc or Cmd/Ctrl+Shift+U to close</span>
      </div>

      <div className="cx-lab__controls">
        <label>
          stage width <input type="range" min={30} max={100} value={width} onChange={(e) => setWidth(+e.target.value)} />
          <output>{width}%</output>
        </label>
        <label>
          grid min <input type="range" min={100} max={320} step={10} value={min} onChange={(e) => setMin(+e.target.value)} />
          <output>{min}px</output>
        </label>
        <label>
          grid max <input type="range" min={1} max={8} value={max} onChange={(e) => setMax(+e.target.value)} />
          <output>{max}</output>
        </label>
        <label>
          rowHeight <input type="range" min={0} max={160} step={2} value={rowHeight} onChange={(e) => setRowHeight(+e.target.value)} />
          <output>{rowHeight === 0 ? 'auto' : `${rowHeight}px`}</output>
        </label>
      </div>
      <div className="cx-lab__log" aria-live="polite">{log.length ? log.join('\n') : 'activation log — click, or focus + Enter / Space on anything'}</div>

      <h3>CollectionGrid + CollectionCard (stack, overlay, action, header-only, inert)</h3>
      <p className="cx-lab__note">The grid holds anything; the cards are the only thing it knows nothing about. Drag the sliders.</p>
      <div className="cx-lab__stage" style={stage}>
        <CollectionGrid columns={{ min, max }} rowHeight={rowHeight || undefined}>
          <CollectionCard
            aspectRatio="3 / 4"
            isSelected={selected.has('n1')}
            onClick={() => toggle('n1')}
            header={<CardTitleSection icon="note" title="Stack · header + content" description="Team sync notes" metadata={['Edited today']} metadataLayout="vertical" minMetadataLines={2} />}
            actions={<button type="button" className="cx-lab__action" onClick={() => say('card action (card did not open)')}>⋯</button>}
          >
            <ScaledCanvas designWidth={DOC_WIDTH}>
              <Doc />
            </ScaledCanvas>
          </CollectionCard>
          <CollectionCard
            aspectRatio="3 / 4"
            isSelected={selected.has('n2')}
            onClick={() => toggle('n2')}
            header={<CardTitleSection emoji="🌊" title="Stack · media banner" metadata={['Edited yesterday']} minMetadataLines={2} />}
            media={<div style={{ height: 56, borderRadius: 8, overflow: 'hidden' }}><Art hue={200} /></div>}
          >
            <ScaledCanvas designWidth={DOC_WIDTH}>
              <Doc />
            </ScaledCanvas>
          </CollectionCard>
          <CollectionCard
            layout="overlay"
            aspectRatio="4 / 5"
            onClick={() => say('open overlay')}
            media={<Art hue={300} label="media fills the card" />}
            header={<CardTitleSection icon="image" title="Overlay · photo.png" metadata={[{ label: 'Size', value: '4 MB' }, { label: 'Created', value: 'Today' }]} metadataLayout="vertical" />}
          />
          <CollectionCard
            onClick={() => say('open header-only')}
            header={<CardTitleSection icon="folder" title="Header-only (a folder tile)" metadata={['3 Subfolders', '12 Notes']} />}
          />
          <CollectionCard
            tone="action"
            aspectRatio="3 / 4"
            onClick={() => say('create')}
            header={<CardTitleSection icon="plus" title="New Note" />}
          />
          <CollectionCard
            header={<CardTitleSection icon="note" title="Inert card" description="no onClick → no role, no focus" />}
          />
          <div style={{ border: '1px dashed var(--border-default)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--foreground-tertiary)' }}>
            …or any element at all
          </div>
        </CollectionGrid>
      </div>

      <h3>CollectionRow — list and cell layouts</h3>
      <div className="cx-lab__stage" style={stage}>
        <CollectionRow icon="note" title="list · title and description side by side" description="description" metadata={<span>Today</span>} onClick={() => say('open row')} />
        <CollectionRow emoji="🌊" title="list · selected, media, actions" isSelected metadata={<span>12 Aug</span>} media={<CollectionMedia><Art hue={120} /></CollectionMedia>} actions={<button type="button" className="cx-lab__action" onClick={() => say('row action')}>Restore</button>} onClick={() => say('open selected row')} />
        <CollectionRow tone="action" icon="plus" title="list · action tone (New Note)" onClick={() => say('new')} />
        <CollectionRow layout="cell" icon="note" title="cell · stacked" description="description" metadata={<span>metadata line</span>} />
        <CollectionRow layout="cell" icon="note" title="cell · placeholder" descriptionPlaceholder="No description" />
      </div>

      <h3>CollectionDataList</h3>
      <div className="cx-lab__stage" style={stage}>
        <CollectionDataList items={listItems} newItem={{ label: 'New Note', onClick: () => say('list newItem') }} />
      </div>

      <h3>CollectionDataTable — one CollectionTableCell: header | text | media (dateTime lives on text)</h3>
      <div className="cx-lab__stage" style={stage}>
        <CollectionDataTable columns={COLUMNS} rows={tableRows} newItem={{ label: 'New Note', onClick: () => say('table newItem') }} />
      </div>

      <h3>CollectionMedia</h3>
      <div className="cx-lab__row">
        <div className="cx-lab__cell"><CollectionMedia><Art hue={40} /></CollectionMedia>visual</div>
        <div className="cx-lab__cell"><CollectionMedia onClick={() => say('media button')} label="Change"><Art hue={160} /></CollectionMedia>button</div>
      </div>

      <h3>ScaledCanvas — one 600px design, three widths (lazy=false)</h3>
      <div className="cx-lab__row">
        {[120, 240, 360].map((w) => (
          <div className="cx-lab__cell" key={w} style={{ width: w }}>
            <div style={{ border: '1px dashed var(--border-default)' }}>
              <ScaledCanvas designWidth={DOC_WIDTH} lazy={false}>
                <Doc />
              </ScaledCanvas>
            </div>
            {w}px wide → {(w / DOC_WIDTH).toFixed(2)}×
          </div>
        ))}
      </div>
    </div>
  );
}
