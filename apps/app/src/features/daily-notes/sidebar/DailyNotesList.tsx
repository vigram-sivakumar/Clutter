import type { Folder } from '@core/vault/models';
import { DailyNotePath } from '@core/application/daily-notes/DailyNotePath';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { Section } from '@app/layouts/sidebar/section/Section';
import { formatDate, isCurrentYear, isToday } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';

import { DailyNote } from './DailyNote';

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
}

function collectRealMonthSections(vault: Vault, query: VaultQuery): RealMonthSection[] {
  const root = vault.getReservedFolder('daily-notes');

  if (!root) {
    return [];
  }

  const sections: RealMonthSection[] = [];

  for (const yearFolder of query.getChildFolders(root.id)) {
    for (const monthFolder of query.getChildFolders(yearFolder.id)) {
      sections.push({
        monthFolder,
        monthIsoDate: DailyNotePath.monthIsoFromFolderNames(
          yearFolder.name,
          monthFolder.name
        ),
      });
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

  return sections.map((section) => {
    const monthFolder = section.monthFolder;
    const key = monthFolder?.id ?? `unplaced:${section.monthIsoDate}`;
    // A folder-less (unplaced) section has nothing to collapse/open —
    // always expanded, no folder-navigate handler — since there is no
    // Folder yet for workspace.isFolderExpanded/onOpenFolder to target.
    const isExpanded = monthFolder ? workspace.isFolderExpanded(monthFolder.id) : true;

    return (
      <Section
        key={key}
        hasHeader
        title={formatMonthSectionTitle(section.monthIsoDate)}
        isCollapsible={monthFolder !== null}
        isExpanded={isExpanded}
        onExpandedChange={
          monthFolder ? () => workspace.toggleFolderExpanded(monthFolder.id) : undefined
        }
        // selected={workspace.activeFolderId === monthFolder?.id}
        onClick={monthFolder ? () => onOpenFolder(monthFolder.id) : undefined}
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
            />
          );
        })}
      </Section>
    );
  });
}
