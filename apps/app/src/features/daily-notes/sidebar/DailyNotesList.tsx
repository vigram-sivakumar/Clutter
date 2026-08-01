import type { Folder } from '@core/vault/models';
import { DailyNotePath } from '@core/application/daily-notes/DailyNotePath';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Vault } from '@core/vault/models';
import type { Workspace } from '@core/workspace/Workspace';
import { Section } from '@app/layouts/sidebar/section/Section';
import { formatDate, isCurrentYear, isToday } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

import { DailyNote } from './DailyNote';

interface MonthSection {
  yearFolder: Folder;
  monthFolder: Folder;
  monthIsoDate: ISODate;
}

interface DailyNotesListProps {
  vault: Vault;
  query: VaultQuery;
  workspace: Workspace;
  onOpen(pageId: string): void;
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
    ? formatDate(monthIsoDate, 'monthShort')
    : formatDate(monthIsoDate, 'monthYear');
}

export function DailyNotesList({
  vault,
  query,
  workspace,
  onOpen,
  onOpenFolder,
}: DailyNotesListProps) {
  const monthSections = sortMonthSections(collectMonthSections(vault, query));

  return monthSections.map((section) => {
    const pages = query
      .getChildPages(section.monthFolder.id)
      .sort((a, b) => b.name.localeCompare(a.name));
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
        {pages.map((note) => (
          <DailyNote
            key={note.id}
            title={formatDate(note.name, 'date')}
            date={note.name}
            isToday={isToday(note.name)}
            selected={workspace.activePageId === note.id}
            onClick={() => onOpen(note.id)}
          />
        ))}
      </Section>
    );
  });
}
