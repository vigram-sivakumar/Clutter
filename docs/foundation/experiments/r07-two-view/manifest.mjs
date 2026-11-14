import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { platform, release, arch } from 'node:os';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [
  'package.json',
  'package-lock.json',
  'build.mjs',
  'serve.mjs',
  'cli.mjs',
  'mcp.mjs',
  'manifest.mjs',
  'index.html',
  'control.html',
  'origin.html',
  'style.css',
  ...readdirSync('native-macos')
    .filter((name) => /\.(swift|js|mjs|json)$/.test(name))
    .map((name) => 'native-macos/' + name),
  ...['src', 'test'].flatMap((dir) =>
    readdirSync(dir)
      .filter((n) => n.endsWith('.mjs'))
      .map((n) => dir + '/' + n)
  ),
].sort();
const hashes = Object.fromEntries(
  files.map((name) => [name, sha(readFileSync(name))])
);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const manifest = {
  candidate: 'R07-PM-PUBLIC-02',
  alternatives: ['R07-PM-ORIGIN-02'],
  iteration: 'R07-09-cell-text-triple-click-2026-11-14',
  date: '2026-11-14',
  scope:
    'Exploratory two-view candidates and native host source; native compilation/execution must be recorded separately',
  sourceHashes: hashes,
  dependencyLockSha256: hashes['package-lock.json'],
  versions: Object.fromEntries(
    Object.entries(lock.packages)
      .filter(([name]) => name && !name.includes('@esbuild/'))
      .map(([name, p]) => [name, p.version])
  ),
  environment: {
    os: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
  },
  schema:
    'src/schema.mjs; minimal R02-derived semantic subset, not canonical Clutter schema',
  profiles: {
    raw: 'Unpatched pinned ProseMirror libraries; guard disabled explicitly in diagnostic test only',
    guarded:
      'Default Context plus conservative history-guard.mjs; refuses foreign deletion/opaque overlap',
    control:
      'Archived legacy table-key profile: CT-01 raw; CT-02 changes only selection preflight. Neither defines current table policy.',
    selection:
      'Focused native TextSelection mapped through public posAtDOM before key commands; no timers/private observers; skip composition, node/cell model selections and nested controls',
    origin:
      'Separate OriginAuthority accepted Y.Doc and per-context provisional replicas. y-prosemirror 1.3.7 sync/undo plugins, Yjs 13.6.33, no prosemirror-history plugin in this candidate. Remote deliveries have an untracked origin. No server/provider transport.',
    plugins: [
      'history depth=100, newGroupDelay=500ms',
      'collab with explicit context origin and current version',
      'explicit keymap (including guarded undo/redo)',
      'baseKeymap',
      'tableEditing',
    ],
    tablePolicy:
      'table-interaction-contract.md confirmed 2026-11-14; origin structural handle history uses conservative public StackItem.meta guard after foreign changes; raw history control route retained.',
    keymap:
      'src/browser.mjs: shared confirmed table-command.mjs; caret-end Tab/Shift-Tab, same-column Enter/bottom no-op, Shift-Enter hard break, final Tab no-op; explicit table-view handles. Mod-z/redo and Mod-b retain candidate history.',
  },
  histories:
    'Per editing context, preserved across view detach; not persisted across host restart. Foreign accepted steps rebased via pinned collab plugin. Guard is an experiment, not accepted selective undo design.',
  representations:
    'Authority accepted doc; immutable engine caches/provisional input in contexts; snapshot/recovery records deliberately serialize protected copies.',
  persistence:
    'MemoryStore in tests, browser-only localStorage in UI, FileStore separate headless processes; never production app/vault. Node snapshot uses fsync/rename and directory fsync, not power-loss qualification.',
  adapters:
    'CLI and MCP share execute(); headless disk adapters serialize by fail-closed lab lock. They do not connect to the browser authority. No general IPC/grants/takeover implemented.',
  unsupported: [
    'macOS/WKWebView/IME/VoiceOver/native menus',
    'Windows',
    'task page projection and full task move/copy/delete/recurrence commands',
    'block IDs and schema migration',
    'image/PDF import/render',
    'opening original embedded page',
    'provider sync and remote-snapshot undo',
    'history/step-log compaction and optimized provenance',
    'performance budgets and large workloads',
    'production security/authentication/IPC/process election',
  ],
  qualification:
    'Exploratory targeted alternatives only. Raw controls remain failing. Full native/semantic/lifecycle/performance qualification is still blocked; see follow-up findings and separate evidence. The origin candidate has no persistence/CLI/MCP bridge.',
};
mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/candidate-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log('Wrote artifacts/candidate-manifest.json');
