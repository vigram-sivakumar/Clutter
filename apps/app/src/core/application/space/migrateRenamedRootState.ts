import { readWorkspaceStateFileText, mergeAndWriteWorkspaceStateFile } from '../../vault/initialize/workspaceStateFile';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * A page, folder or asset with no persisted id gets its absolute path as its id (`IdentityResolver`, documented as
 * transitional). Renaming a Space's folder therefore changes every such id — and everything saved under one: which
 * folders are collapsed, the open view, view settings, fold state, template choices. Ids that came from frontmatter
 * (or a folder's `.folder.md`) never contain the path, so they are stable and are left exactly as they are.
 *
 * This remaps ONLY those ids, and ONLY in the places a store is known to keep an id — one handler per store key,
 * each written against that store's own persisted shape. It is deliberately not a search-and-replace over the file:
 * other strings (names, tags, relative paths, the Space's own id) are never touched, even if they look like a path.
 */
const FOLDER_VIEW_KEY_PREFIX = 'folder:';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What the id becomes: unchanged unless it is a path inside the old root (the separator is required, not a prefix of a sibling). */
export function remapPathDerivedId(id: string, oldRoot: string, newRoot: string): string {
  return id.startsWith(`${oldRoot}/`) ? `${newRoot}${id.slice(oldRoot.length)}` : id;
}

type Remap = (id: string) => string;

function remapIdList(value: unknown, remap: Remap): unknown {
  if (!Array.isArray(value)) return value;
  const next = value.map((entry) => (typeof entry === 'string' ? remap(entry) : entry));
  return next.every((entry, index) => entry === value[index]) ? value : next;
}

/** A record whose KEYS are ids; the values travel with their key. */
function remapKeys(value: unknown, remap: Remap, mapValue: (v: unknown) => unknown = (v) => v): unknown {
  if (!isRecord(value)) return value;
  let changed = false;
  const next: Json = {};
  for (const [key, entry] of Object.entries(value)) {
    const nextKey = remap(key);
    const nextEntry = mapValue(entry);
    changed ||= nextKey !== key || nextEntry !== entry;
    next[nextKey] = nextEntry;
  }
  return changed ? next : value;
}

function remapId(value: unknown, remap: Remap): unknown {
  return typeof value === 'string' ? remap(value) : value;
}

const handlers: Record<string, (value: unknown, remap: Remap) => unknown> = {
  /** WorkspaceSessionStore: the open page or folder, and the collapsed folders of the Notes sidebar. */
  workspaceSession(value, remap) {
    if (!isRecord(value)) return value;
    let next = value;
    const navigation = value.navigation;
    if (isRecord(navigation) && isRecord(navigation.activeView)) {
      const view = navigation.activeView;
      if ((view.type === 'page' || view.type === 'folder') && typeof view.id === 'string' && remap(view.id) !== view.id) {
        next = { ...next, navigation: { ...navigation, activeView: { ...view, id: remap(view.id) } } };
      }
    }
    const sidebar = value.sidebar;
    if (isRecord(sidebar) && isRecord(sidebar.notes)) {
      const collapsed = remapIdList(sidebar.notes.collapsedFolderIds, remap);
      if (collapsed !== sidebar.notes.collapsedFolderIds) {
        next = { ...next, sidebar: { ...sidebar, notes: { ...sidebar.notes, collapsedFolderIds: collapsed } } };
      }
    }
    return next;
  },

  /** CollectionViewConfigStore: `folder:<id>` entries, and the manual sidebar order (a list of ids) inside any entry. */
  collectionViewConfig(value, remap) {
    return remapKeys(
      value,
      (key) => (key.startsWith(FOLDER_VIEW_KEY_PREFIX) ? FOLDER_VIEW_KEY_PREFIX + remap(key.slice(FOLDER_VIEW_KEY_PREFIX.length)) : key),
      (entry) => {
        if (!isRecord(entry)) return entry;
        const order = remapIdList(entry.sidebarOrder, remap);
        return order === entry.sidebarOrder ? entry : { ...entry, sidebarOrder: order };
      }
    );
  },

  /** FoldStateStore: fold state per page, and per host page which embedded pages are collapsed. */
  foldState: (value, remap) => remapKeys(value, remap),
  embedCollapse: (value, remap) => remapKeys(value, remap, (host) => remapKeys(host, remap)),

  /** ReferencesDisplayStore: display choices per page. */
  referencesDisplay: (value, remap) => remapKeys(value, remap),

  /** TemplateUsageStore: last-used time per template page. */
  templateUsage: (value, remap) => remapKeys(value, remap),

  /** PreferredTemplatesStore: template pages per context, and the default daily-note template. */
  preferredTemplates: (value, remap) => remapIdList(value, remap),
  preferredNoteTemplates: (value, remap) => remapIdList(value, remap),
  defaultDailyNoteTemplate: (value, remap) => remapId(value, remap),

  /** SpaceProfileStore: only the default note folder's id; the Space's own `id`, avatar and settings are untouched. */
  space(value, remap) {
    if (!isRecord(value) || typeof value.defaultNoteFolderId !== 'string') return value;
    const next = remap(value.defaultNoteFolderId);
    return next === value.defaultNoteFolderId ? value : { ...value, defaultNoteFolderId: next };
  },
};

/** The top-level keys of `file` that change, with their new values: a patch, empty when nothing needed remapping. */
export function remapRenamedRootState(file: Json, oldRoot: string, newRoot: string): Json {
  const remap: Remap = (id) => remapPathDerivedId(id, oldRoot, newRoot);
  const patch: Json = {};
  for (const [key, handler] of Object.entries(handlers)) {
    if (!(key in file)) continue;
    const next = handler(file[key], remap);
    if (next !== file[key]) patch[key] = next;
  }
  return patch;
}

/**
 * Carries the saved state of the Space whose folder was renamed from `oldRoot` to `newRoot` over to its new ids.
 * Run on the renamed folder, before it is opened. Nothing else in the file is rewritten (the write merges the
 * patched keys into the current file). Resolves whether the state is now consistent; a failure is reported to the
 * caller, which decides how to tell the user — it never throws.
 */
export async function migrateRenamedRootState(
  fileSystem: VaultFileSystem,
  oldRoot: string,
  newRoot: string
): Promise<boolean> {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readWorkspaceStateFileText(fileSystem, newRoot));
    } catch (error) {
      // Not valid JSON: the stores read such a file as empty too, so there is nothing to carry over (and nothing
      // is rewritten). Any other failure is a real read error and is reported below.
      if (error instanceof SyntaxError) return true;
      throw error;
    }
    if (!isRecord(parsed)) return true;
    const file: Json = parsed;
    const patch = remapRenamedRootState(file, oldRoot, newRoot);
    if (Object.keys(patch).length === 0) return true;
    await mergeAndWriteWorkspaceStateFile(fileSystem, newRoot, patch);
    return true;
  } catch (error) {
    console.error('Carrying the renamed space’s saved state over failed:', error);
    return false;
  }
}
