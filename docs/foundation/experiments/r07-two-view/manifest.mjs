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
  'live-cli.mjs',
  'live-mcp.mjs',
  'matched-comparison-contract.json',
  'manifest.mjs',
  'index.html',
  'control.html',
  'origin.html',
  'style.css',
  ...readdirSync('native-macos')
    .filter((name) => /\.(swift|js|mjs|json)$/.test(name))
    .map((name) => 'native-macos/' + name),
  ...readdirSync('joined-native')
    .filter((n) => /\.(swift|js|mjs|json|md)$/.test(n))
    .map((n) => 'joined-native/' + n),
  ...readdirSync('joined')
    .filter((n) => /\.(mjs|md|json)$/.test(n))
    .map((n) => 'joined/' + n),
  ...readdirSync('media')
    .filter((n) => /\.(mjs|md|json)$/.test(n))
    .map((n) => 'media/' + n),
  ...readdirSync('media/fixtures')
    .filter((n) => /\.(png|pdf)$/.test(n))
    .map((n) => 'media/fixtures/' + n),
  ...readdirSync('entities')
    .filter((n) => /\.(mjs|md|json)$/.test(n))
    .map((n) => 'entities/' + n),
  ...readdirSync('durable')
    .filter((n) => /\.(mjs|json|html|md)$/.test(n))
    .map((n) => 'durable/' + n),
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
  iteration: 'R08-22-external-media-closure-2026-11-15',
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
    media:
      'Build22 external content-addressed PNG/PDF publication before SQL, note/task body/cover associations, retained-root file closure; shared Store extensions, Linux process-crash proof only; no renderer/power-loss/Mac flush acceptance.',
    entities:
      'Build21 proposed notes/tasks Y maps and canonical task pages; derived single placements, multi-note atomic moves and conservative note restore through common Store/host. No editor binding, production format or performance acceptance.',
    joinedNative:
      'Runner16 prepared: checksum-pinned Mac Node, separate Swift/WK host, same-user synthetic bootstrap/context handoff. Linux packaged helper checks only; no Mac archive/SDK/signing/WK result or production security/host acceptance.',
    joined:
      'R08-15: two real PM/Y views use a remote read cache/provisional contexts; a real headless process stages accepted Y bytes and commits root/receipt through common SQLite Store before publication. JG-01–10 run separately; native/entity/external-asset gates remain open.',
    durable:
      'Separate P-SQL proof: real child-process exclusive SQLite owner; atomic document-version/outcome, protected drafts, pinned roots and tiny in-DB blobs. Browser projections/CLI/MCP share that owner; full editor/native integration not qualified. Exact SQLite build/readback in durable-results-final.json.',
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
    'Editor candidates retain their MemoryStore/browser localStorage and legacy FileStore fixtures. Snapshot durable/ and joined Y/native profiles have separate marked stores and share the same Store/host; actual joined editors use the real Y owner. No production or power-loss qualification.',
  adapters:
    'Legacy file adapters remain independent controls. Live adapters reach the browser via the test relay; durable adapters reach a real SQLite owner directly. CLI/MCP share framing/transport and owner domain logic. No production discovery/grants/takeover implemented.',
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
    'Exploratory targeted alternatives only. Raw controls remain failing. Full native/semantic/lifecycle/performance qualification is still blocked; see follow-up findings and separate evidence. The Origin candidate has ephemeral live CLI/MCP ingress; the separate joined/ profile connects actual PM/Y views to the durable process; production native/entity/media gates remain open.',
};
mkdirSync('artifacts', { recursive: true });
writeFileSync(
  'artifacts/candidate-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n'
);
console.log('Wrote artifacts/candidate-manifest.json');
