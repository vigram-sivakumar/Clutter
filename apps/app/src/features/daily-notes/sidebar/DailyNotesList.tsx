import type { Folder } from '@core/vault/models';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { Section } from '@app/layouts/sidebar/section/Section';
import { formatDate, isCurrentMonth, isCurrentYear, isToday } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';

import { DailyNote } from './DailyNote';
import { buildDailyNoteSidebarMenu } from './dailyNoteSidebarMenu.config';

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
  pages: EffectivePage[];
}

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
  onOpenFolder(folderId: string): void;
  /** Overflow-menu/rename wiring — see DailyNoteRowActions. */
  rowActions?: DailyNoteRowActions;
}

function collectRealMonthSections(vault: Vault, query: VaultQuery): RealMonthSection[] {
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

function sortRenderedSections(sections: RenderedMonthSection[]): RenderedMonthSection[] {
  return sections.sort((a, b) => b.monthIsoDate.localeCompare(a.monthIsoDate));
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
  onOpenFolder,
  rowActions,
}: DailyNotesListProps) {
  const sectionsByMonth = new Map<ISODate, RenderedMonthSection>();

  for (const { monthFolder, monthIsoDate } of collectRealMonthSections(vault, query)) {
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
      sectionsByMonth.set(monthIsoDate, { monthFolder: null, monthIsoDate, pages: [page] });
    }
  }

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

  // Three consecutive sections, concatenated — not one global date sort.
  // A single descending sort across every month would put any future
  // year's month (e.g. March 2027) above the current year's own remaining
  // months (e.g. July 2026), which is wrong: the current year must stay
  // together, directly under the current month, regardless of how many
  // future years exist. sortRenderedSections' descending order is still
  // what each partition individually needs (newest-first within the
  // current year, then newest-year-first across the rest) — filtering it
  // into three groups and concatenating preserves that relative order
  // within each group without re-sorting.
  const currentMonthSection = sections.find((section) =>
    isCurrentMonth(section.monthIsoDate)
  );
  const currentYearRest = sections.filter(
    (section) =>
      section !== currentMonthSection && isCurrentYear(section.monthIsoDate)
  );
  const otherYears = sections.filter(
    (section) => !isCurrentYear(section.monthIsoDate)
  );
  const remainingSections = [...currentYearRest, ...otherYears];

  const renderMonthSection = (
    section: RenderedMonthSection,
    hasHeader: boolean
  ) => {
    const monthFolder = section.monthFolder;
    const key = monthFolder?.id ?? `unplaced:${section.monthIsoDate}`;
    // Interactivity is content-driven, not folder-existence-driven — every
    // rendered section already has at least one page by this point (the
    // .filter above guarantees it), whether persisted or an in-memory draft
    // (ADR-023). A missing Folder changes *how* expand state is tracked and
    // where a click navigates, never *whether* the section is interactive:
    // a folder-less section falls back to Workspace's generic, string-keyed
    // section state (same mechanism renderTasksByDate.tsx uses for
    // 'tasks-today'/'tasks-upcoming') using the same synthetic key used
    // above, and to opening its one page directly (mirroring each row's own
    // onClick just below) since there's no Folder to open a collection for.
    const isExpanded = monthFolder
      ? workspace.isFolderExpanded(monthFolder.id)
      : workspace.isSectionExpanded(key);

    const handleExpandedChange = monthFolder
      ? () => workspace.toggleFolderExpanded(monthFolder.id)
      : () => workspace.toggleSectionExpanded(key);

    const handleClick = monthFolder
      ? () => onOpenFolder(monthFolder.id)
      : () => {
          // ADR-023: "at most one [unplaced] entry exists at a time" — see
          // the comment above where these sections are built — so the
          // section's own single page is the click target. section.pages
          // is non-empty here (the .filter above guarantees every rendered
          // section has at least one page), TypeScript just can't see that
          // through the array index.
          const onlyPage = section.pages[0]!;
          return onlyPage.isDraft ? onOpenDraft(onlyPage.id) : onOpen(onlyPage.id);
        };

    return (
      <Section
        key={key}
        hasHeader={hasHeader}
        title={formatMonthSectionTitle(section.monthIsoDate)}
        isCollapsible={section.pages.length > 0}
        isExpanded={isExpanded}
        onExpandedChange={handleExpandedChange}
        // selected={workspace.activeFolderId === monthFolder?.id}
        onClick={handleClick}
      >
        {section.pages.map((entry) => {
          const label = getPageDisplayLabel(entry);

          return (
            <DailyNote
              key={entry.id}
              title={label.text}
              titleStyle={getPageDisplayLabelStyle(label)}
              date={entry.name}
              isToday={isToday(entry.name)}
              selected={workspace.activePageId === entry.id}
              onClick={() =>
                entry.isDraft ? onOpenDraft(entry.id) : onOpen(entry.id)
              }
              menuItems={rowActions ? buildDailyNoteSidebarMenu(entry.isDraft) : undefined}
              menuOpen={rowActions?.openMenuId === entry.id}
              onMenuOpenChange={
                rowActions
                  ? (open) => (open ? rowActions.onOpenMenu(entry.id) : rowActions.onCloseMenu())
                  : undefined
              }
              onMenuSelect={
                rowActions
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
        })}
      </Section>
    );
  };

  return (
    <>
      {currentMonthSection && renderMonthSection(currentMonthSection, false)}
      {remainingSections.map((section) => renderMonthSection(section, true))}
    </>
  );
}
