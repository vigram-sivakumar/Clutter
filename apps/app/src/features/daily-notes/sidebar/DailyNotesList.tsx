import type { Folder } from '@core/vault/models';
import { DailyNotePath } from '@core/application/daily-notes/DailyNotePath';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { Section } from '@app/layouts/sidebar/section/Section';
import { formatDate, isCurrentYear, isToday } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';

import { DailyNote } from './DailyNote';

interface MonthSection {
  yearFolder: Folder;
  monthFolder: Folder;
  monthIsoDate: ISODate;
}

interface DailyNotesListProps {
  // Folders only — year/month folders have no draft concept (ARCHITECTURE_RULES.md rule 13).
  vault: Vault;
  query: VaultQuery;
  // ADR-020 / rule 13: the single read surface for page rendering —
  // existence, identity, and presentation fields for both durable and
  // draft-only Daily Notes.
  effectivePageState: EffectivePageState;
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

function collectMonthSections(vault: Vault, query: VaultQuery): MonthSection[] {
  const root = vault.getReservedFolder('daily-notes');

  if (!root) {
    return [];
  }

  const sections: MonthSection[] = [];

  for (const yearFolder of query.getChildFolders(root.id)) {
    for (const monthFolder of query.getChildFolders(yearFolder.id)) {
      sections.push({
        yearFolder,
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

function sortMonthSections(sections: MonthSection[]): MonthSection[] {
  return sections.sort((a, b) => b.monthIsoDate.localeCompare(a.monthIsoDate));
}

function formatMonthSectionTitle(section: MonthSection): string {
  const monthIsoDate = section.monthIsoDate;
  return isCurrentYear(monthIsoDate)
    ? formatDate(monthIsoDate, 'monthLong')
    : formatDate(monthIsoDate, 'monthYear');
}

export function DailyNotesList({
  vault,
  query,
  effectivePageState,
  workspace,
  onOpen,
  onOpenDraft,
  onOpenFolder,
}: DailyNotesListProps) {
  const monthSections = sortMonthSections(collectMonthSections(vault, query));

  return monthSections
    .map((section) => ({
      section,
      pages: effectivePageState
        .getChildPages(section.monthFolder.id)
        .sort((a, b) => b.name.localeCompare(a.name)),
    }))
    // A month section with no Daily Notes in it has nothing to show — a
    // permanent presentation rule, independent of how the month folder
    // itself came to exist (always materialized at persist time, per
    // DailyNoteService.ensureFolderChain — ADR-019).
    .filter(({ pages }) => pages.length > 0)
    .map(({ section, pages }) => {
      const isExpanded = workspace.isFolderExpanded(section.monthFolder.id);

      return (
        <Section
          key={section.monthFolder.id}
          hasHeader
          title={formatMonthSectionTitle(section)}
          isCollapsible
          isExpanded={isExpanded}
          onExpandedChange={() => {
            workspace.toggleFolderExpanded(section.monthFolder.id);
          }}
          // selected={workspace.activeFolderId === section.monthFolder.id}
          onClick={() => onOpenFolder(section.monthFolder.id)}
        >
          {pages.map((entry) => {
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
