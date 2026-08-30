import type { Folder } from '@core/vault/models';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { Section } from '@app/layouts/sidebar/section/Section';
import { formatDate, isCurrentYear, isToday } from '@shared/helpers/time';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { ISODate } from '@shared/helpers/time/types';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';

import { DailyNote } from './DailyNote';
import { buildDailyNoteSidebarMenu } from './dailyNoteSidebarMenu.config';
import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';

// The Workspace session-state id for the "All Daily Notes" collapsible
// section (see Workspace.collapsedSectionIds) — seeded collapsed there by
// default, unlike every other section id, so Daily Notes shows only the
// current month on first render each session.
const ALL_DAILY_NOTES_SECTION_ID = 'daily-notes-all';

interface RealMonthSection {
  monthFolder: Folder;
  monthIsoDate: ISODate;
}

// A rendered month section — monthFolder is null for a not-yet-materialized
// month (ADR-023): a Daily Note draft can be a member of Daily Notes before
// its year/month folder chain exists on disk, so this section has nothing
// to open/collapse (no Folder to toggle) but still groups by the same
// month convention every real section uses.
interface RenderedMonthSection {
  monthFolder: Folder | null;
  monthIsoDate: ISODate;
  pages: TimelineEntry[];
}

// A page-shaped timeline row. Real and draft entries come straight from
// MembershipSelector; isVirtual marks the one synthetic exception built by
// buildVirtualTodayEntry, so click routing can tell the two apart without
// a second, parallel entry type.
type TimelineEntry = EffectivePage & { isVirtual?: boolean };

/**
 * Single owner of "which Daily Note row's overflow menu is open," supplied
 * by Sidebar.DailyNotes.tsx — the same ownership pattern as FolderTree's
 * SidebarRowActions, narrowed to what a Daily Note row actually supports:
 * no rename at all (draft or persisted — see dailyNoteSidebarMenu.config.ts),
 * no folder actions (month/year folders aren't user-managed here).
 */
export interface DailyNoteRowActions {
  openMenuId: string | null;
  onOpenMenu(id: string): void;
  onCloseMenu(): void;

  onArchiveNote(pageId: string): void;
  onDeleteNote(pageId: string): void;
}

interface DailyNotesListProps {
  // Folders only — year/month folders have no draft concept (ARCHITECTURE_RULES.md rule 13).
  vault: Vault;
  query: VaultQuery;
  // ADR-023: the single owner of "is this a Daily Note" — identity-driven
  // (page.type), never inferred from folder hierarchy. This is what lets a
  // Daily Note draft with no month folder yet still resolve as a member
  // here, instead of only ever being reachable through an existing
  // year/month folder the way membership was previously determined.
  membershipSelector: MembershipSelector;
  workspace: Workspace;
  onOpen(pageId: string): void;
  /**
   * A draft has no Vault entry yet, so onOpen() (PageOperations.open(),
   * which requires one) would throw for it — it's already open via
   * openAtPath(), so clicking it again is a re-select, not a fresh open.
   * Same reasoning as FolderTree's onDraftPageClick.
   */
  onOpenDraft(pageId: string): void;
  /**
   * Opens (creating a draft if needed) the Daily Note for an arbitrary
   * date — the same call Application.openFallbackPage() makes for today
   * at boot (via Sidebar.tsx). Used only for the virtual Today row's
   * click, since it has no real page/draft id yet to route through
   * onOpen/onOpenDraft.
   */
  onOpenDate(date: string): void;
  /** Overflow-menu/rename wiring — see DailyNoteRowActions. */
  rowActions?: DailyNoteRowActions;
  /** Same injected resolution boundary the page editor uses — see Note's own prop doc comment. */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
}

function collectRealMonthSections(
  vault: Vault,
  query: VaultQuery
): RealMonthSection[] {
  const root = vault.getReservedFolder('daily-notes');

  if (!root) {
    return [];
  }

  const sections: RealMonthSection[] = [];

  for (const yearFolder of query.getChildFolders(root.id)) {
    for (const monthFolder of query.getChildFolders(yearFolder.id)) {
      // A year/month folder pair that doesn't match the Daily Notes
      // naming convention (e.g. a user-created "08" instead of "August")
      // has no month section to render — skip it rather than letting
      // monthIsoFromFolderNames' throw crash the whole sidebar. The
      // Markdown files underneath are untouched; they're just not
      // eligible for month-section grouping under an unrecognized name.
      let monthIsoDate: RealMonthSection['monthIsoDate'];

      try {
        monthIsoDate = DailyNotePath.monthIsoFromFolderNames(
          yearFolder.name,
          monthFolder.name
        );
      } catch {
        continue;
      }

      sections.push({ monthFolder, monthIsoDate });
    }
  }

  return sections;
}

// The month an "unplaced" (folderId: null) Daily Note entry belongs to,
// derived from its own date rather than a folder — entry.name is the
// filename-derived ISODate for every Daily Note, draft or persisted alike
// (PageOperations.resolveDraftTarget defaults an untitled Daily Note
// draft's title to the same deriveNameFromPath the persisted filename
// uses), so this is the same convention DailyNote's own date/isToday
// props already rely on, not a new one.
function monthIsoDateFromDailyNoteName(name: string): ISODate {
  return `${name.slice(0, 7)}-01`;
}

// Ascending — the whole list is one chronological timeline, oldest first;
// a month heading is only a visual marker inserted where the timeline
// crosses into a new month, never an independently ordered container.
function sortRenderedSections(
  sections: RenderedMonthSection[]
): RenderedMonthSection[] {
  return sections.sort((a, b) => a.monthIsoDate.localeCompare(b.monthIsoDate));
}

// Application.openFallbackPage() unconditionally opens/reuses a draft for
// today at boot, which is how today's row already appears in the common
// case (it flows through membershipSelector.getDailyNoteChildPages like
// any other draft) — but that call is fire-and-forget, so there's a real
// window where DailyNotesList can render before it resolves. This
// synthetic, render-only entry closes that gap without touching
// PageOperations/Vault/drafts: it never gets a real id, is never
// persisted, and simply stops being built once a real page/draft for
// today exists.
function buildVirtualTodayEntry(
  todayIso: ISODate,
  folderId: string | null
): TimelineEntry {
  return {
    id: `virtual-today:${todayIso}`,
    type: 'daily-note',
    folderId,
    isDraft: true,
    name: todayIso,
    description: null,
    markdown: '',
    icon: null,
    favorite: false,
    isVirtual: true,
  };
}

// A month in the current year needs no year suffix (the calendar already
// establishes it); any other year — past or future — carries its own year
// right in the heading (e.g. "March 2027", "November 2025") instead of a
// separate year-level heading, which would add a hierarchy level this list
// deliberately stays flat without.
function formatMonthSectionTitle(monthIsoDate: ISODate): string {
  return isCurrentYear(monthIsoDate)
    ? formatDate(monthIsoDate, 'monthLong')
    : formatDate(monthIsoDate, 'monthYear');
}

export function DailyNotesList({
  vault,
  query,
  membershipSelector,
  workspace,
  onOpen,
  onOpenDraft,
  onOpenDate,
  rowActions,
  resolveWikiLink,
  resolveTag,
}: DailyNotesListProps) {
  const sectionsByMonth = new Map<ISODate, RenderedMonthSection>();

  for (const { monthFolder, monthIsoDate } of collectRealMonthSections(
    vault,
    query
  )) {
    sectionsByMonth.set(monthIsoDate, {
      monthFolder,
      monthIsoDate,
      pages: membershipSelector.getDailyNoteChildPages(monthFolder.id),
    });
  }

  // Unplaced entries (ADR-023) — folded into whichever real month section
  // already covers their date, if any, otherwise rendered as their own
  // folder-less section. In practice at most one such entry exists at a
  // time: draft accumulation is prevented one layer down, at creation time
  // (PageOperations.openAtPath's findReusableDraftId).
  for (const page of membershipSelector.getDailyNoteChildPages(null)) {
    const monthIsoDate = monthIsoDateFromDailyNoteName(page.name);
    const existing = sectionsByMonth.get(monthIsoDate);

    if (existing) {
      existing.pages = [...existing.pages, page];
    } else {
      sectionsByMonth.set(monthIsoDate, {
        monthFolder: null,
        monthIsoDate,
        pages: [page],
      });
    }
  }

  // Today must always be represented (existing behavior — see
  // Application.openFallbackPage). Fold in the virtual entry here, before
  // sorting/filtering, so it's indistinguishable from a real entry to
  // every step that follows.
  const todayIso = toISODate(new Date());
  const currentMonthIso = monthIsoDateFromDailyNoteName(todayIso);
  const currentMonthDraftSection = sectionsByMonth.get(currentMonthIso);
  const hasTodayEntry =
    currentMonthDraftSection?.pages.some((page) => isToday(page.name)) ?? false;

  if (!hasTodayEntry) {
    const virtualToday = buildVirtualTodayEntry(
      todayIso,
      currentMonthDraftSection?.monthFolder?.id ?? null
    );

    if (currentMonthDraftSection) {
      currentMonthDraftSection.pages = [
        ...currentMonthDraftSection.pages,
        virtualToday,
      ];
    } else {
      sectionsByMonth.set(currentMonthIso, {
        monthFolder: null,
        monthIsoDate: currentMonthIso,
        pages: [virtualToday],
      });
    }
  }

  // Months run oldest to newest (a month heading is only a visual marker at
  // each month boundary, never an independent ordering container), but days
  // within a month run newest to oldest — the most recent note in a month
  // is the one most likely to be reopened, so it sits closest to the
  // section boundary. No current-month/current-year/other-years
  // partitioning.
  const sections = sortRenderedSections(Array.from(sectionsByMonth.values()))
    .map((section) => ({
      ...section,
      pages: section.pages.sort((a, b) => b.name.localeCompare(a.name)),
    }))
    // A month section with no Daily Notes in it has nothing to show — a
    // permanent presentation rule, independent of how the month folder
    // itself came to exist (always materialized at persist time, per
    // DailyNoteService.ensureFolderChain — ADR-019).
    .filter(({ pages }) => pages.length > 0);

  // The calendar above this list already identifies the current month, so
  // its rows render directly, unheaded — "current" is a lookup against the
  // chronological timeline, not a sorting rule. Every other month goes
  // under "All Daily Notes", in the same chronological order the timeline
  // already produced (a plain filter, not a second sort/partition).
  const currentMonthSection = sections.find(
    (section) => section.monthIsoDate === currentMonthIso
  );
  const otherSections = sections.filter(
    (section) => section !== currentMonthSection
  );

  const renderPages = (pages: TimelineEntry[]) =>
    pages.map((entry) => {
      const label = getPageDisplayLabel(entry);

      return (
        <DailyNote
          key={entry.id}
          title={label.text}
          titleStyle={getPageDisplayLabelStyle(label)}
          resolveWikiLink={resolveWikiLink}
          resolveTag={resolveTag}
          date={entry.name}
          isToday={isToday(entry.name)}
          selected={workspace.activePageId === entry.id}
          onClick={() => {
            if (entry.isVirtual) {
              return onOpenDate(entry.name);
            }

            return entry.isDraft ? onOpenDraft(entry.id) : onOpen(entry.id);
          }}
          menuItems={
            rowActions && !entry.isVirtual
              ? buildDailyNoteSidebarMenu(entry.isDraft)
              : undefined
          }
          menuOpen={rowActions?.openMenuId === entry.id}
          onMenuOpenChange={
            rowActions && !entry.isVirtual
              ? (open) =>
                  open
                    ? rowActions.onOpenMenu(entry.id)
                    : rowActions.onCloseMenu()
              : undefined
          }
          onMenuSelect={
            rowActions && !entry.isVirtual
              ? (id) => {
                  if (id === 'archive') {
                    rowActions.onArchiveNote(entry.id);
                  } else if (id === 'delete') {
                    rowActions.onDeleteNote(entry.id);
                  }
                }
              : undefined
          }
        />
      );
    });

  return (
    <>
      {currentMonthSection && (
        <Section>
          {renderPages(currentMonthSection.pages)}

          {otherSections.length > 0 && (
            <Entry
              className="tertiary"
              leading={<AppIcon icon="moreVertical" />}
              onClick={() =>
                workspace.toggleSectionExpanded(ALL_DAILY_NOTES_SECTION_ID)
              }
            >
              {workspace.isSectionExpanded(ALL_DAILY_NOTES_SECTION_ID)
                ? 'See less'
                : 'See more'}
            </Entry>
          )}
        </Section>
      )}

      {otherSections.length > 0 &&
        workspace.isSectionExpanded(ALL_DAILY_NOTES_SECTION_ID) && (
          <Section>
            {otherSections.map((section) => {
              const key =
                section.monthFolder?.id ?? `unplaced:${section.monthIsoDate}`;

              return (
                <Section
                  key={key}
                  hasHeader
                  title={formatMonthSectionTitle(section.monthIsoDate)}
                >
                  {renderPages(section.pages)}
                </Section>
              );
            })}
          </Section>
        )}
    </>
  );
}
