/**
 * Shared helpers for the macOS Trash sandbox specs (ADR-072).
 *
 * Nothing here names a user: the real home comes from the runner (which is not sandboxed), the container from the
 * test identity. The runner only ever touches the Trash by the exact, per-run-unique names it created — it never
 * lists the Trash (macOS privacy protection denies that, and the Trash holds things that are not ours).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The real home of the user running the specs (the runner is a normal process, not the sandboxed app). */
export const REAL_HOME = os.homedir();
export const REAL_DOCS = `${REAL_HOME}/Documents`;
/** The test identity this run drives. Never a real Clutter identity. */
export const SBX_ID = process.env.CLUTTER_SBX_ID ?? 'com.clutter.sandboxtest';
export const CONTAINER = process.env.CLUTTER_FAKE_HOME ?? `${REAL_HOME}/Library/Containers/${SBX_ID}/Data`;

if (!['com.clutter.sandboxtest', 'com.clutter.sandboxfresh'].includes(SBX_ID) || !CONTAINER.endsWith(`/Library/Containers/${SBX_ID}/Data`)) {
  throw new Error(`Refusing to run: CLUTTER_FAKE_HOME must be the container of a sandbox test identity, got ${JSON.stringify(CONTAINER)} for ${SBX_ID}`);
}

/** The three kinds of Space this suite covers, each with its own folder so a failed run never touches another kind's. */
export type SpaceKind = 'docs' | 'existing' | 'outside';

export const SPACE_PATHS: Record<SpaceKind, string> = {
  /** Inside the real Documents folder: reached through the saved Documents bookmark. */
  docs: `${REAL_DOCS}/ClutterSbxTrash`,
  /** Outside Documents but inside /Users (the b1/b2 pattern): reached through a saved picker bookmark. */
  existing: '/Users/Shared/zz-sbx-trash-existing',
  /** Outside /Users (the c1/c2 pattern): reached through a saved picker bookmark. */
  outside: '/private/tmp/zz-sbx-trash-outside',
};

/** Per-kind run state written by the setup spec and read by the relaunch spec. Lives in the container, never in a Space. */
const statePath = (kind: SpaceKind) => `${CONTAINER}/trash-state-${kind}.json`;
const LOCATIONS = `${CONTAINER}/trash-locations.json`;

export interface Fixture {
  kind: SpaceKind;
  space: string;
  /** Unique per setup run: every name in the Trash is unique to this run. */
  run: string;
  noteA: { id: string; file: string; body: string };
  noteC: { id: string; file: string; body: string };
  folder: { id: string; name: string; files: Record<string, string>; noteIds: string[] };
}

type Answer = { ok?: any; err?: string };

/** Calls a command from inside the webview exactly as page script would. */
export const call = (cmd: string, args: unknown = {}): Promise<Answer> =>
  browser.executeAsync(
    (c: string, a: unknown, done: (r: unknown) => void) => {
      (window as any).__TAURI_INTERNALS__.invoke(c, a).then(
        (v: unknown) => done({ ok: v }),
        (e: unknown) => done({ err: typeof e === 'string' ? e : JSON.stringify(e) })
      );
    },
    cmd,
    args
  ) as Promise<Answer>;

export const registerSpaces = (paths: string[], active: string): Promise<void> =>
  browser.execute((value: string[], current: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: value, activePath: current })), paths, active) as Promise<void>;

export const readRegistry = (): Promise<{ paths: string[]; activePath: string } | null> =>
  browser.execute(() => {
    const raw = localStorage.getItem('clutter.spaces.v1');
    return raw === null ? null : JSON.parse(raw);
  }) as Promise<{ paths: string[]; activePath: string } | null>;

export const bodyText = (): Promise<string> => browser.execute(() => document.body.innerText) as Promise<string>;

/**
 * The system file panel runs in another process: send it a key a few seconds after it opens. keys: 36 Return, 53 Escape.
 * `safekey.sh` presses only while the sandbox test app's panel is up and the app is frontmost (attended: needs
 * Accessibility permission for the terminal running the specs).
 */
export function pressAfter(...keys: number[]): void {
  spawn(path.resolve(HERE, '../tools/safekey.sh'), ['40', ...keys.map(String)], { detached: true, stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------

const frontmatter = (id: string, body: string) => `---\nid: ${id}\n---\n${body}\n`;

/** Seeds one Space with: two notes (A deleted, C for the failure case) and one folder tree with an untracked file. */
export function seedFixture(kind: SpaceKind): Fixture {
  const space = SPACE_PATHS[kind];
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const note = (tag: string) => ({ id: `trash-${run}-${tag}`, file: `trash-${run}-${tag}.md`, body: `body of ${tag} ${run}` });
  const noteA = note('a');
  const noteC = note('c');
  const folderName = `trash-${run}-folder`;
  const innerId = `trash-${run}-inner`;
  const deepId = `trash-${run}-deep`;
  const folder = {
    id: `trash-${run}-folderid`,
    name: folderName,
    noteIds: [innerId, deepId],
    // Relative to the folder: tracked notes, a nested folder, and files Clutter does not track.
    files: {
      '.folder.md': `---\nid: trash-${run}-folderid\n---\n`,
      [`inner.md`]: frontmatter(innerId, `inner ${run}`),
      [`sub/deep.md`]: frontmatter(deepId, `deep ${run}`),
      [`sub/untracked-${run}.dat`]: `untracked bytes ${run}`,
      [`untracked-${run}.txt`]: `untracked text ${run}`,
    } as Record<string, string>,
  };

  fs.mkdirSync(`${space}/.clutter`, { recursive: true });
  for (const n of [noteA, noteC]) fs.writeFileSync(`${space}/${n.file}`, frontmatter(n.id, n.body));
  for (const [rel, content] of Object.entries(folder.files)) {
    const full = `${space}/${folderName}/${rel}`;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  const fixture: Fixture = { kind, space, run, noteA, noteC, folder };
  fs.writeFileSync(statePath(kind), JSON.stringify(fixture, null, 2));
  return fixture;
}

export function loadFixture(kind: SpaceKind): Fixture {
  if (!fs.existsSync(statePath(kind))) throw new Error(`no setup state for "${kind}": run its setup spec first`);
  return JSON.parse(fs.readFileSync(statePath(kind), 'utf8')) as Fixture;
}

export const forgetFixtureState = (kind: SpaceKind): void => fs.rmSync(statePath(kind), { force: true });

/** Every file under `dir`, relative, with contents: the manifest a trashed folder must still match. */
export function manifestOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = `${current}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Trash destination
// ---------------------------------------------------------------------------------------------------------------

export type TrashHome = 'real-home' | 'container';

/** The only two places a sandboxed trashItem can land. Probed by exact path, never listed. */
export const trashCandidates = (name: string): { home: TrashHome; path: string }[] => [
  { home: 'real-home', path: `${REAL_HOME}/.Trash/${name}` },
  { home: 'container', path: `${CONTAINER}/.Trash/${name}` },
];

const present = (p: string): boolean => {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

/** Where `name` is in the Trash right now (zero, one or — a bug — two homes). */
export const findInTrash = (name: string) => trashCandidates(name).filter((c) => present(c.path));

/** Waits for the item to appear in exactly one Trash home and returns it; records the home for the report. */
export async function expectInTrash(name: string, label: string): Promise<{ home: TrashHome; path: string }> {
  await browser.waitUntil(() => findInTrash(name).length > 0, { timeout: 20000, timeoutMsg: `${label}: "${name}" never reached either Trash` });
  const hits = findInTrash(name);
  expect(hits.map((h) => h.home)).toHaveLength(1);
  recordLocation(label, hits[0].home, hits[0].path);
  return hits[0];
}

export const expectNotInTrash = (name: string): void => {
  expect(findInTrash(name)).toEqual([]);
};

function recordLocation(label: string, home: TrashHome, trashPath: string): void {
  const all: Record<string, { home: TrashHome; path: string }> = fs.existsSync(LOCATIONS) ? JSON.parse(fs.readFileSync(LOCATIONS, 'utf8')) : {};
  all[label] = { home, path: trashPath };
  fs.writeFileSync(LOCATIONS, JSON.stringify(all, null, 2));
  console.log(`TRASH-LOCATION ${label}: ${home} -> ${trashPath}`);
}

/**
 * Removes a trashed item by its exact path. Kept when CLUTTER_KEEP_TRASH=1 so Finder visibility and Put Back can be
 * checked by hand (those are manual validation steps).
 */
export function cleanTrash(trashPath: string): void {
  if (process.env.CLUTTER_KEEP_TRASH === '1') return;
  fs.rmSync(trashPath, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------
// UI steps (archive and delete have no test ids, so they are driven by their visible labels)
// ---------------------------------------------------------------------------------------------------------------

/** Clicks the first visible element matching `selector` whose trimmed text is exactly `text`. */
export const clickByText = (selector: string, text: string): Promise<boolean> =>
  browser.execute(
    (sel: string, wanted: string) => {
      const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent ?? '').trim() === wanted && (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined;
      el?.click();
      return el !== undefined;
    },
    selector,
    text
  ) as Promise<boolean>;

export const waitClickByText = (selector: string, text: string, timeout = 15000) =>
  browser.waitUntil(() => clickByText(selector, text), { timeout, timeoutMsg: `nothing matching ${selector} with text "${text}"` });

/** Opens the page's topbar "More actions" menu (not the page-header properties menu) and picks `label`. */
export async function pickPageMenuAction(label: string): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => {
        const trigger = document.querySelector('button[aria-label="More actions"][aria-haspopup="menu"]:not(.page-header-controls__menu)') as HTMLElement | null;
        trigger?.click();
        return trigger !== null;
      })) as boolean,
    { timeout: 15000, timeoutMsg: 'no overflow menu trigger on the page' }
  );
  await waitClickByText('[role="menuitem"], [role="menu"] button, [role="menu"] li', label);
}

/** Opens the Notes tab and the sidebar row with this test id (rows carry the persisted id). */
export async function openSidebarRow(tabId: (tab: string) => string, rowTestId: string): Promise<void> {
  const tab = await $(`[data-testid="${tabId('notes')}"]`);
  await tab.waitForExist({ timeout: 30000 });
  await tab.click();
  const row = await $(`[data-testid="${rowTestId}"]`);
  await row.waitForExist({ timeout: 30000, timeoutMsg: `no sidebar row ${rowTestId}` });
  await browser.execute((id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click(), rowTestId);
}

/** Opens the Archive page from the sidebar footer (its button has no label or test id: it is the footer's one plain button). */
export async function openArchivePage(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await browser.execute(() => {
        const help = document.querySelector('button[aria-label="Help"]');
        const footer = help?.closest('div')?.parentElement;
        const plain = footer ? [...footer.querySelectorAll('button')].filter((b) => !b.hasAttribute('aria-haspopup')) : [];
        plain[plain.length - 1]?.click();
        return plain.length > 0;
      })) as boolean,
    { timeout: 15000, timeoutMsg: 'no Archive button in the sidebar footer' }
  );
  await browser.waitUntil(async () => ((await browser.execute(() => document.body.innerText)) as string).includes('Archived date'), { timeout: 15000, timeoutMsg: 'the Archive page did not open' });
}

/** Opens an archived item (note or folder) from the Archive page by its exact title. */
export async function openArchivedItem(title: string): Promise<void> {
  await openArchivePage();
  await waitClickByText('.collection-entry__title', title);
}
