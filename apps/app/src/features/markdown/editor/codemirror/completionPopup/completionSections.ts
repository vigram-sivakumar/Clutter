import type { CompletionSection } from '@codemirror/autocomplete';

import { buildCompletionSectionHeader } from './completionRow';

/**
 * The popup's titled sections. `rank` orders sections within one popup: `![[` lists all four —
 * media first (Images, PDFs), then notes (Notes, Daily notes, the note picker's own order) — `[[`
 * the note pair, then Folders, Images and PDFs (their own sections, ranked after the notes — the
 * `![[` ones above are not reused, so neither popup's order depends on the other), `#` tags just tags.
 */
function section(name: string, rank: number): CompletionSection {
  return { name, rank, header: () => buildCompletionSectionHeader(name) };
}

export const COMPLETION_SECTIONS = {
  images: section('Images', 0),
  pdfs: section('PDFs', 1),
  notes: section('Notes', 2),
  dailyNotes: section('Daily notes', 3),
  tags: section('Tags', 0),
  linkFolders: section('Folders', 4),
  linkImages: section('Images', 5),
  linkPdfs: section('PDFs', 6),
} as const;
