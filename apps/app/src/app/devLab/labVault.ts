/**
 * TEMPORARY — see DevLab.tsx. One small fake vault (only the fields the real builders read),
 * fed through the app's REAL suggestion/item builders, so every lab surface shows exactly
 * what the app produces — nothing here is a hand-typed picker row or popup row.
 */
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import { buildCoverNoteItems } from '@features/notes/helpers/buildCoverNoteItems';
import { buildCoverFolderItems } from '@features/notes/helpers/buildCoverFolderItems';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { createWikiLinkSuggester } from '../layouts/page/wikiLinkSuggestions';
import { createEmbedSuggester } from '../layouts/page/embedSuggestions';
import { createEmbedHeadingSuggester } from '../layouts/page/headingSuggestions';
import { createTagSuggester } from '../layouts/page/tagSuggestions';

const ROOT = '/lab-vault';

function isoDaysFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function folder(id: string, name: string, parentId: string | null, icon: string | null = null): Folder {
  return { id, name, parentId, metadata: { icon } } as unknown as Folder;
}

const FOLDERS: Folder[] = [
  folder('md', 'Markdown format renders', null),
  folder('projects', 'Projects', null),
  folder('a', 'Project A', 'projects'),
  folder('a-notes', 'Meeting notes', 'a'),
  folder('journal', 'Journal', null, '📓'),
  folder('long', 'A very long folder name that should truncate before it hurts', null),
  folder('daily', 'Daily Notes', null),
];
const folderById = new Map(FOLDERS.map((f) => [f.id, f]));
const SYSTEM_FOLDER_IDS = new Set(['daily']);

function folderPath(parentId: string | null): string {
  const parts: string[] = [];
  for (let id = parentId; id; id = folderById.get(id)?.parentId ?? null) {
    parts.unshift(folderById.get(id)!.name);
  }
  return parts.join('/');
}

function page(
  id: string,
  name: string,
  parentId: string | null,
  options: { icon?: string | null; type?: string; markdown?: string; aliases?: string[] } = {}
): Page {
  const dir = folderPath(parentId);
  return {
    id,
    name,
    type: options.type ?? 'note',
    parentId,
    path: `${ROOT}/${dir ? `${dir}/` : ''}${name}.md`,
    metadata: { icon: options.icon ?? null },
    analysis: { aliases: (options.aliases ?? []).map((value) => ({ value })) },
    source: { markdown: options.markdown ?? '' },
  } as unknown as Page;
}

const PAGES: Page[] = [
  page('n1', 'Headings', 'md', { markdown: '# Overview\n\n## Billing\n\n### Refunds and chargebacks\n' }),
  page('n2', 'Billing', null, { icon: '💳', aliases: ['Invoices'] }),
  page('n3', 'Sprint planning', 'a'),
  page('n4', 'Quarterly review of everything we shipped this year', 'a-notes'),
  ...['Roadmap', 'Retro', 'Hiring', 'Budget', 'Ideas', 'Reading list', 'Travel', 'Recipes', 'Standup', 'Design review'].map((name, i) =>
    page(`extra${i}`, name, i % 2 === 0 ? 'projects' : null)
  ),
  ...[-2, -3, -4, -5, -6, -7, -8, -9, -10, -11].map((offset) =>
    page(`dx${offset}`, isoDaysFromToday(offset), 'daily', { type: 'daily-note' })
  ),
  page('d0', isoDaysFromToday(0), 'daily', { type: 'daily-note' }),
  page('d1', isoDaysFromToday(-1), 'daily', { type: 'daily-note' }),
  page('d2', isoDaysFromToday(-12), 'daily', { type: 'daily-note' }),
  page('d3', isoDaysFromToday(-400), 'daily', { type: 'daily-note' }),
];

function resource(name: string, parentId: string | null, kind: 'image' | 'pdf'): VaultResource {
  const dir = folderPath(parentId);
  return { id: name, name, kind, parentId, path: `${ROOT}/${dir ? `${dir}/` : ''}${name}` } as unknown as VaultResource;
}

const RESOURCES: VaultResource[] = [
  resource('mountain.jpg', 'md', 'image'),
  resource('spec.pdf', 'projects', 'pdf'),
  resource('cover.png', null, 'image'),
];

const vault = {
  root: ROOT,
  pages: () => PAGES,
  getFolder: (id: string) => folderById.get(id),
  getPageByPath: (path: string) => PAGES.find((p) => p.path === path),
  tags: () => ['work', 'personal', 'project/clutter', 'reading-list'].map((name) => ({ name })),
} as unknown as Vault;

const membershipSelector = {
  vaultRoot: ROOT,
  getAllVisibleResources: () => RESOURCES,
  getWorkspaceFolders: () => FOLDERS.filter((f) => f.parentId === null && !SYSTEM_FOLDER_IDS.has(f.id)),
  getVisibleChildFolders: (id: string) => FOLDERS.filter((f) => f.parentId === id),
} as unknown as MembershipSelector;

const effectivePageState = { getPage: () => undefined } as unknown as EffectivePageState;

export const labWikiLinkSuggestions = createWikiLinkSuggester(vault, {} as PageOperations, {} as FolderOperations);
export const labEmbedSuggestions = createEmbedSuggester(vault, membershipSelector);
export const labHeadingSuggestions = createEmbedHeadingSuggester(vault, effectivePageState);
export const labTagSuggestions = createTagSuggester(vault);

export const labFolderItems: PickerListItem[] = buildMoveDestinationItems(membershipSelector);
export const labCoverFolderItems: PickerListItem[] = buildCoverFolderItems(membershipSelector);
export const labNoteItems: PickerListItem[] = buildCoverNoteItems(PAGES, (id) => folderById.get(id));
