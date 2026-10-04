import type { CompletionSection } from '@codemirror/autocomplete';

import { buildCompletionSectionHeader } from './completionRow';

/**
 * The popup's titled sections — the note picker's own (`buildCoverNoteItems`: Notes, then Daily
 * notes). `rank` orders sections within one popup; a popup lists either the note pair or the
 * asset pair, so the two pairs reuse ranks 0 and 1.
 */
function section(name: string, rank: number): CompletionSection {
  return { name, rank, header: () => buildCompletionSectionHeader(name) };
}

export const COMPLETION_SECTIONS = {
  notes: section('Notes', 0),
  dailyNotes: section('Daily notes', 1),
  images: section('Images', 0),
  pdfs: section('PDFs', 1),
} as const;
