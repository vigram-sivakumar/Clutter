// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page, PageType } from '@core/vault/models/Page';
import {
  DATE_FORMAT_CHOICES,
  writeDateFormatChoice,
} from '@shared/helpers/time/dateFormatPreference';
import { buildCoverNoteItems } from '@features/notes/helpers/buildCoverNoteItems';
import { embedPageRow } from '@features/markdown/editor/codemirror/embed/embedCompletionRow';
import { wikiLinkRow } from '@features/markdown/editor/codemirror/wikilink/wikiLinkCompletionRow';

import { buildEntryPresentation } from './buildEntryPresentation';
import { dailyNoteSearchText } from './dailyNoteSearchText';
import { formatDailyNoteTitle } from './formatDailyNoteTitle';
import { getPageDisplayLabel } from './getPageDisplayLabel';

// Today is Tuesday 20 October 2026; the notes below are a day in the current year, one in another year, today and
// tomorrow, so the year rule and the relative words are both in play.
const NAMES = ['2026-03-05', '2025-03-05', '2026-10-20', '2026-10-21'];

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 11, 30));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

/** The flat shape the label and list-row formatters read. */
const entry = (name: string, type: PageType = 'daily-note') => ({
  type,
  name,
  description: null,
  markdown: 'Some content',
  icon: null,
});

/** The vault-page shape the pickers read. */
const pickerPage = (name: string, type: PageType = 'daily-note') =>
  ({
    id: `page-${name}`,
    type,
    name,
    metadata: { icon: null },
  }) as unknown as Page;

/** Every place that writes a Daily Note's title, asked about the same note. */
function surfacesFor(name: string): Record<string, string> {
  const suggestion = {
    kind: 'page' as const,
    path: `Daily Notes/${name}`,
    title: name,
    breadcrumb: null,
    dailyNote: true,
  };

  return {
    'shared formatter': formatDailyNoteTitle(name),
    'generic label (lists, Trash, references)': getPageDisplayLabel(entry(name))
      .text,
    'collection / archive row': buildEntryPresentation(entry(name)).title,
    'wiki-link suggestion': wikiLinkRow(suggestion).row.title,
    'embed suggestion': embedPageRow(suggestion).row.title,
    'cover picker': buildCoverNoteItems([pickerPage(name)], () => undefined)[0]!
      .title,
  };
}

describe.each(DATE_FORMAT_CHOICES)(
  'Daily Note titles with the %s Date format',
  (format) => {
    beforeEach(() => writeDateFormatChoice(format));

    it.each(NAMES)('%s reads the same on every surface', (name) => {
      const titles = Object.values(surfacesFor(name));

      expect(new Set(titles).size).toBe(1);
      expect(titles[0]).toBe(formatDailyNoteTitle(name));
    });
  }
);

describe('Daily Note titles follow the preference and the year rule', () => {
  it.each([
    ['full', ['5 March', '5 March 2025', '20 October', '21 October']],
    ['short', ['5 Mar', '5 Mar 2025', '20 Oct', '21 Oct']],
    [
      'weekday',
      ['Thu, 5 Mar', 'Wed, 5 Mar 2025', 'Tue, 20 Oct', 'Wed, 21 Oct'],
    ],
    ['mdy', ['03/05/2026', '03/05/2025', '10/20/2026', '10/21/2026']],
    ['dmy', ['05/03/2026', '05/03/2025', '20/10/2026', '21/10/2026']],
    ['ymd', ['2026/03/05', '2025/03/05', '2026/10/20', '2026/10/21']],
    [
      'relative',
      [
        'Thu, 5 March',
        'Wed, 5 March 2025',
        'Today, 20 October',
        'Tomorrow, 21 October',
      ],
    ],
  ] as const)('%s', (format, expected) => {
    writeDateFormatChoice(format);
    expect(NAMES.map(formatDailyNoteTitle)).toEqual(expected);
  });
});

describe('only a real Daily Note is given a date title', () => {
  it('an ordinary note whose title looks like a date keeps its own title, in every format', () => {
    for (const format of DATE_FORMAT_CHOICES) {
      writeDateFormatChoice(format);
      expect(getPageDisplayLabel(entry('2026-10-20', 'note')).text).toBe(
        '2026-10-20'
      );
      expect(buildEntryPresentation(entry('2026-10-20', 'note')).title).toBe(
        '2026-10-20'
      );
      expect(
        buildCoverNoteItems(
          [pickerPage('2026-10-20', 'note')],
          () => undefined
        )[0]!.title
      ).toBe('2026-10-20');
      expect(
        wikiLinkRow({
          kind: 'page',
          path: 'Notes/2026-10-20',
          title: '2026-10-20',
          breadcrumb: 'Notes',
        }).row.title
      ).toBe('2026-10-20');
    }
  });
});

describe('display only: names, paths and stored values never change', () => {
  it('leaves the page name, the Daily Note path and the search identity as the ISO date, in every format', () => {
    for (const format of DATE_FORMAT_CHOICES) {
      writeDateFormatChoice(format);
      const page = entry('2026-10-20');

      getPageDisplayLabel(page);
      buildEntryPresentation(page);

      expect(page.name).toBe('2026-10-20');
      expect(DailyNotePath.from(new Date(2026, 9, 20))).toBe(
        'Daily Notes/2026/October/2026-10-20.md'
      );
      expect(dailyNoteSearchText('2026-10-20')).toContain('2026-10-20');
    }
  });

  it('is found by its month, weekday and canonical date whichever format is shown', () => {
    for (const format of DATE_FORMAT_CHOICES) {
      writeDateFormatChoice(format);
      const text = dailyNoteSearchText('2026-10-20').toLowerCase();

      expect(text).toContain('october');
      expect(text).toContain('tuesday');
      expect(text).toContain('2026-10-20');
    }
  });
});
