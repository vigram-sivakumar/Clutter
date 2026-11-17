// Read-only planning inventory. Conservative static imports, not bundler/runtime proof.
import ts from 'typescript';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export function inventory(root) {
  const src = join(root, 'apps/app/src'),
    nodes = new Map(),
    unresolved = [];
  const aliases = {
    '@app/': 'app/',
    '@components/': 'components/',
    '@features/': 'features/',
    '@design-system/': 'design-system/',
    '@styles/': 'design-system/styles/',
    '@core/': 'core/',
    '@shared/': 'shared/',
    '@devtools/': '../devtools/',
  };
  const code = (p) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(p),
    testFile = (p) => /\.(?:test|spec)\.[^/]+$|\/__tests__\//.test(p);
  const rel = (p) => relative(root, p).split('\\').join('/');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );
  const files = walk(src),
    production = files.filter((p) => code(p) && !testFile(p));
  const resolveImport = (from, spec) => {
    const clean = spec.split('?')[0];
    let target;
    if (clean.startsWith('.')) target = resolve(dirname(from), clean);
    else {
      const prefix = Object.keys(aliases).find((a) => clean.startsWith(a));
      if (prefix)
        target = resolve(src, aliases[prefix] + clean.slice(prefix.length));
      else return null;
    }
    return [
      target,
      ...[
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.css',
        '.json',
        '.svg',
        '.png',
      ].map((e) => target + e),
      ...['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((e) =>
        join(target, e)
      ),
    ].find((p) => existsSync(p) && statSync(p).isFile());
  };
  function load(file) {
    if (nodes.has(file) || !code(file) || testFile(file)) return;
    const text = readFileSync(file, 'utf8'),
      ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
      entry = {
        imports: [],
        flags: new Set(),
        hash: createHash('sha256').update(text).digest('hex'),
      };
    nodes.set(file, entry);
    const path = rel(file);
    if (
      path.startsWith('apps/app/src/core/') ||
      path.startsWith('packages/engine/')
    )
      entry.flags.add('legacy-core');
    if (path.startsWith('apps/app/src/features/markdown/'))
      entry.flags.add('legacy-editor');
    function add(spec, typeOnly = false) {
      if (/^@codemirror\/|^@lezer\/|^codemirror$/.test(spec))
        entry.flags.add('cm6-lezer');
      if (/^@tauri-apps\/|^node:/.test(spec)) entry.flags.add('platform');
      const target = resolveImport(file, spec);
      entry.imports.push({ spec, typeOnly, ...(target ? { target } : {}) });
      if (target) load(target);
      else if (
        spec.startsWith('.') ||
        Object.keys(aliases).some((a) => spec.startsWith(a))
      )
        unresolved.push({ from: path, spec });
    }
    function visit(n) {
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      )
        add(
          n.moduleSpecifier.text,
          !!n.isTypeOnly || !!n.importClause?.isTypeOnly
        );
      if (
        ts.isCallExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      )
        add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    }
    visit(ast);
  }
  for (const file of production) load(file);
  function assess(file) {
    const queue = [[file]],
      seen = new Set(),
      paths = {};
    let count = 0;
    while (queue.length) {
      const chain = queue.shift(),
        current = chain.at(-1);
      if (seen.has(current)) continue;
      seen.add(current);
      const n = nodes.get(current);
      if (!n) continue;
      count++;
      for (const flag of n.flags)
        if (!paths[flag]) paths[flag] = chain.map(rel);
      for (const edge of n.imports)
        if (edge.target) queue.push([...chain, edge.target]);
    }
    return {
      file: rel(file),
      sourceModulesInClosure: count,
      structuralCoupling: Object.keys(paths).sort(),
      shortestExamplePaths: paths,
    };
  }
  const roots = [
    'app/App.tsx',
    'app/AppShell.tsx',
    'app/main.tsx',
    'app/layouts/app-layout/AppLayout.tsx',
    'app/layouts/page/PageHost.tsx',
    'components/button/Button.tsx',
    'components/input/Input.tsx',
    'components/dialog/Dialog.tsx',
    'components/overlay/Overlay.tsx',
    'components/menu/Menu.tsx',
    'components/toast/ToastProvider.tsx',
    'shared/icon/AppIcon.tsx',
    'design-system/useTheme.ts',
    'components/property-list/PropertyList.tsx',
    'components/tabs/Tabs.tsx',
    'components/space-avatar/SpaceAvatar.tsx',
    'components/entry/Entry.tsx',
  ];
  const components = {};
  for (const file of production.filter((p) =>
    rel(p).startsWith('apps/app/src/components/')
  )) {
    const group = rel(file).split('/')[4],
      a = assess(file);
    components[group] ??= {
      sourceModules: 0,
      coupledSourceModules: 0,
      flags: new Set(),
    };
    const c = components[group];
    c.sourceModules++;
    if (a.structuralCoupling.length) c.coupledSourceModules++;
    for (const flag of a.structuralCoupling) c.flags.add(flag);
  }
  const groups = {};
  for (const file of production) {
    const p = relative(src, file).split('/'),
      key = p.slice(0, 2).join('/');
    groups[key] = (groups[key] ?? 0) + 1;
  }
  return {
    format: 'clutter-rebuild-inventory51',
    scope:
      'Current foundation-branch files; static literal imports including type-only edges. No remote main merge, behavior/runtime/CSS accessibility audit or wholesale reuse approval.',
    counts: {
      productionSourceFiles: production.length,
      testSourceFiles: files.filter((p) => code(p) && testFile(p)).length,
      parsedReachableSourceFiles: nodes.size,
      unresolvedLocalImports: unresolved.length,
    },
    sourceTreeSha256: createHash('sha256')
      .update(
        JSON.stringify([...nodes].map(([p, n]) => [rel(p), n.hash]).sort())
      )
      .digest('hex'),
    groups: Object.fromEntries(
      Object.entries(groups).sort((a, b) => b[1] - a[1])
    ),
    representativeRoots: roots
      .filter((p) => existsSync(join(src, p)))
      .map((p) => assess(join(src, p))),
    componentGroups: Object.fromEntries(
      Object.entries(components)
        .sort()
        .map(([k, v]) => [k, { ...v, flags: [...v.flags].sort() }])
    ),
    unresolvedLocalImports: unresolved,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      inventory(resolve(dirname(fileURLToPath(import.meta.url)), '../../..')),
      null,
      2
    )
  );
