/**
 * TEMPORARY — see DevLab.tsx. The shared completion row + popup theme, fed with the same real
 * suggestions the app's five completion kinds produce, so the new look can be compared with the
 * current popups before any real source or renderer is changed.
 */
import { autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionSection } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { buildCompletionRow, buildCompletionSectionHeader, type CompletionRowSpec } from '@features/markdown/editor/codemirror/completionPopup/completionRow';
import { completionPopupTheme } from '@features/markdown/editor/codemirror/completionPopup/completionPopupTheme';
import { getDateSuggestions } from '@features/markdown/editor/codemirror/date/dateSuggestion';
import { formatDailyNotePickerTitle } from '@core/presentation/formatDailyNoteTitle';
import { isToday } from '@shared/helpers/time';
import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

import noteIcon from '@shared/icon/svg/note.svg?raw';
import pdfIcon from '@shared/icon/svg/pdf.svg?raw';
import plusIcon from '@shared/icon/svg/plus.svg?raw';
import tagIcon from '@shared/icon/svg/tag.svg?raw';
import hashIcon from '@shared/icon/svg/hash.svg?raw';
import calendarIcon from '@shared/icon/svg/calendar-blank.svg?raw';
import calendarNoteIcon from '@shared/icon/svg/calendar-note.svg?raw';
import calendarDotIcon from '@shared/icon/svg/calendar-dot.svg?raw';

import { renderPdfThumbnail } from '@features/pdf/pdfThumbnail';
import { labSwatch, labEmbedSuggestions, labHeadingSuggestions, labTagSuggestions, labWikiLinkSuggestions } from './labVault';

export type PrototypeKind = 'wikilink' | 'wikilink-create' | 'embed' | 'heading' | 'tag' | 'date';

/** A small real PDF (one page, the name as its heading) so the lab renders a real first page. */
function labPdfUrl(name: string): string {
  const stream = `BT /F1 40 Tf 40 720 Td (${name.replace(/[()\\]/g, '')}) Tj ET\n0.2 0.4 0.8 rg 40 600 300 60 re f\n0.8 0.8 0.8 rg 40 500 500 12 re f 40 470 420 12 re f 40 440 480 12 re f`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
}

interface Row {
  readonly spec: CompletionRowSpec;
  readonly section?: string;
}

function rowsFor(kind: PrototypeKind): Row[] {
  switch (kind) {
    case 'wikilink': {
      // Same split as the note picker (buildCoverNoteItems): notes first, then daily notes, each
      // alphabetical. A daily note reads as its short date title, with no path, and its own icon.
      // The lab detects a daily note by its folder; a real suggestion would carry its page type.
      const pages = labWikiLinkSuggestions('').flatMap((s) => (s.kind === 'page' ? [s] : []));
      const isDaily = (s: (typeof pages)[number]) => s.breadcrumb === 'Daily Notes';
      return [
        ...pages
          .filter((s) => !isDaily(s))
          .map((s) => ({
            section: 'Notes',
            spec: { iconSvg: noteIcon, title: s.title, titleSuffix: s.alias, path: s.breadcrumb },
          })),
        ...pages.filter(isDaily).map((s) => ({
          section: 'Daily notes',
          spec: {
            iconSvg: isToday(s.title) ? calendarDotIcon : calendarNoteIcon,
            title: formatDailyNotePickerTitle(s.title),
          },
        })),
      ];
    }
    case 'wikilink-create': {
      const suggestions = labWikiLinkSuggestions('Projects/Project A/Zebra');
      return suggestions.map((s) => {
        const path = s.path;
        const slash = path.lastIndexOf('/');
        return {
          spec: { iconSvg: plusIcon, title: `Create "${path.slice(slash + 1)}"`, path: slash === -1 ? null : path.slice(0, slash) },
        };
      });
    }
    case 'embed':
      // Images, then PDFs — each its own section, as the note picker splits Notes and Daily notes.
      return [...labEmbedSuggestions('')].sort((a, b) => Number(a.resourceKind === 'pdf') - Number(b.resourceKind === 'pdf')).map((s) => ({
        section: s.resourceKind === 'pdf' ? 'PDFs' : 'Images',
        // Images show their own picture (the lab uses a gradient swatch for the file); a PDF shows its first page.
        spec:
          s.resourceKind === 'pdf'
            ? { iconSvg: pdfIcon, thumbnail: renderPdfThumbnail(labPdfUrl(s.title), 36), title: s.title, path: s.breadcrumb }
            : { thumbnail: labSwatch('#4cc9f0', '#3a0ca3'), title: s.title, path: s.breadcrumb },
      }));
    case 'heading':
      return labHeadingSuggestions('Markdown format renders/Headings', '').map((s) => ({
        spec: { iconSvg: hashIcon, title: s.heading, trailing: `H${s.level}` },
      }));
    case 'tag':
      return labTagSuggestions('r').map((name) => ({ spec: { iconSvg: tagIcon, title: name } }));
    case 'date':
      return ['', '2026-12-25', 'next friday'].flatMap((query) =>
        getDateSuggestions(query).map((s) => ({
          spec: {
            iconSvg: calendarIcon,
            title: formatDateDisplay(s.isoDate, 'shortWeekday'),
            trailing: /^[A-Za-z]+$/.test(s.label) ? s.label : undefined,
          },
        }))
      );
  }
}

/** One popup, opened by `startCompletion`, listing `kind`'s rows with the shared row and theme. */
export function prototypeCompletion(kind: PrototypeKind): Extension {
  const rows = rowsFor(kind);
  const sections = new Map<string, CompletionSection>();
  const options: Completion[] = rows.map((row, index) => {
    let section: CompletionSection | undefined;
    if (row.section) {
      section = sections.get(row.section) ?? {
        name: row.section,
        rank: sections.size,
        header: (self) => buildCompletionSectionHeader(self.name, (self.rank as number) > 0),
      };
      sections.set(row.section, section);
    }
    return { label: `${row.spec.title}-${index}`, section, info: undefined };
  });

  return [
    autocompletion({
      override: [(context) => ({ from: context.pos, options, filter: false })],
      icons: false,
      closeOnBlur: false,
      addToOptions: [
        {
          position: 50,
          render: (completion, _state, view) => {
            const row = rows[options.indexOf(completion)];
            return row ? buildCompletionRow(row.spec, view) : null;
          },
        },
      ],
    }),
    completionPopupTheme(),
  ];
}
