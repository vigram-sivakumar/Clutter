import ts from 'typescript';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = {
  core: [],
  editor: ['core'],
  ui: ['core', 'editor'],
  'desktop-runtime': ['core', 'editor'],
};
let count = 0;
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(directory, d.name)) : [join(directory, d.name)]
  );
for (const [owner, targets] of Object.entries(allowed)) {
  for (const file of walk(join(root, 'packages', owner, 'src')).filter((p) =>
    /\.(ts|mts|mjs|jsx)$/.test(p)
  )) {
    const text = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : file.endsWith('.mjs')
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS
    );
    const check = (spec) => {
      let target;
      if (spec.startsWith('.'))
        target = relative(root, resolve(dirname(file), spec));
      else if (spec.startsWith('@clutter/'))
        target = 'packages/' + spec.slice('@clutter/'.length);
      else {
        if (owner === 'core' || (owner === 'ui' && spec.startsWith('node:')))
          throw Error('Invalid platform dependency: ' + file + ' -> ' + spec);
        return;
      }
      if (target.startsWith('docs/') || target.startsWith('apps/'))
        throw Error('Invalid composition dependency: ' + file + ' -> ' + spec);
      const packageName = target.split('/')[1];
      if (packageName !== owner && !targets.includes(packageName))
        throw Error('Invalid package dependency: ' + file + ' -> ' + spec);
      if (
        owner === 'ui' &&
        /editor\/(src\/)?(backend|engine|page-codec|page-model|qualified-replica)/.test(
          target
        )
      )
        throw Error('UI imports backend codec');
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        check(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      )
        check(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    count++;
  }
}
const retiredSources = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((d) => {
    if (
      [
        'node_modules',
        'target',
        'dist',
        'out',
        'artifacts',
        'coverage',
        '.git',
      ].includes(d.name)
    )
      return [];
    const p = join(directory, d.name);
    return d.isDirectory() ? retiredSources(p) : [p];
  });
for (const retired of [
  'apps/app',
  'apps/foundation-desktop',
  'packages/foundation-runtime',
  'packages/foundation-ui',
  'packages/automation',
  'workers',
]) {
  const directory = join(root, retired);
  if (
    existsSync(directory) &&
    retiredSources(directory).some(
      (p) =>
        /\.(ts|tsx|js|jsx|mjs|mts|rs|swift|c|cpp|py)$/.test(p) ||
        /(?:package\.json|Cargo\.toml)$/.test(p)
    )
  )
    throw Error('Retired implementation remains: ' + retired);
}
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'))).packages;
if (
  Object.keys(lock).some((p) =>
    /node_modules\/(?:@codemirror\/|@lezer\/|codemirror(?:\/|$)|markdown-it(?:\/|$)|marked(?:\/|$))/.test(
      p
    )
  )
)
  throw Error('Legacy Markdown/CM6 dependency remains');
console.log(
  'Validated ' +
    count +
    ' shared source files, package directions and retired product/dependency removal.'
);
