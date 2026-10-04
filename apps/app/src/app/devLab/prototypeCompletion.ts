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
import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';

import noteIcon from '@shared/icon/svg/note.svg?raw';
import imageIcon from '@shared/icon/svg/image.svg?raw';
import pdfIcon from '@shared/icon/svg/pdf.svg?raw';
import plusIcon from '@shared/icon/svg/plus.svg?raw';
import tagIcon from '@shared/icon/svg/tag.svg?raw';
import hashIcon from '@shared/icon/svg/hash.svg?raw';
import calendarIcon from '@shared/icon/svg/calendar-blank.svg?raw';

import { labEmbedSuggestions, labHeadingSuggestions, labTagSuggestions, labWikiLinkSuggestions } from './labVault';

export type PrototypeKind = 'wikilink' | 'wikilink-create' | 'embed' | 'heading' | 'tag' | 'date';

interface Row {
  readonly spec: CompletionRowSpec;
  readonly section?: string;
}

function rowsFor(kind: PrototypeKind): Row[] {
  switch (kind) {
    case 'wikilink':
      return labWikiLinkSuggestions('').flatMap((s) =>
        s.kind === 'page'
          ? [{ section: 'Notes', spec: { iconSvg: noteIcon, title: s.title, titleSuffix: s.alias, path: s.breadcrumb } }]
          : []
      );
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
      return labEmbedSuggestions('').map((s) => ({
        section: 'Assets',
        spec: { iconSvg: s.resourceKind === 'pdf' ? pdfIcon : imageIcon, title: s.title, path: s.breadcrumb },
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
        header: () => buildCompletionSectionHeader(row.section!),
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
