import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What the webview may ask the fs plugin to do is exactly what Clutter's own code asks of it, and nothing that
 * overwrites a file by path in bulk.
 *
 * The plugin's overwriting commands (`write_file`, `copy_file`, `create`, `truncate`, `write`) take any path inside
 * the scope, and `open` opens for writing and truncating on the strength of the read permission alone, so a broad
 * grant such as `fs:allow-home-write-recursive` or `fs:allow-home-read-recursive` lets script overwrite or empty a
 * file in a Space whatever the vault code does. Vault writes go through the native commands, which refuse an
 * existing destination (`copy_file_no_clobber`, `write_file_no_clobber`, `move_file_no_clobber`) or write through
 * the Persistence Gate's atomic writer; exports to a place the user chose go through a ticket from the native Save
 * panel (`export_file.rs`). This test ties the capability to the source in both directions, so a new plugin call
 * cannot appear without its permission being a conscious decision, and a permission cannot linger unused.
 *
 * What is still granted and can still overwrite a path in scope: `rename` (the legacy inner vault writer's replace,
 * `TagMetadataStore`'s replace) and `remove`, `mkdir`. (`write_text_file` is gone: recovery records are written by the
 * native `recovery_write`.) They share the static scope
 * `$HOME/**` with every Space, so they cannot be separated from Space files by a permission; that is recorded in
 * `docs/building-and-distribution.md` rather than claimed away.
 */
const SRC = join(__dirname, '..', '..', '..');
const CAPABILITY = JSON.parse(readFileSync(join(SRC, '..', 'src-tauri', 'capabilities', 'default.json'), 'utf8')) as {
  permissions: Array<string | { identifier: string; allow?: unknown[] }>;
};
const PLUGIN_FS = readFileSync(join(SRC, '..', '..', '..', 'node_modules', '@tauri-apps', 'plugin-fs', 'dist-js', 'index.js'), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every function Clutter's non-test source imports from the fs plugin. */
function importedPluginFunctions(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@tauri-apps\/plugin-fs'/g)) {
      for (const name of match[1]!.split(',')) {
        const imported = name.trim().split(/\s+as\s+/)[0]!;
        if (imported) found.add(imported);
      }
    }
  }
  return found;
}

/** The plugin command a JS function invokes, read from the installed package rather than assumed. */
function commandOf(functionName: string): string {
  const start = PLUGIN_FS.search(new RegExp(`(?:async )?function ${functionName}\\(`));
  expect(start, `${functionName} exists in @tauri-apps/plugin-fs`).toBeGreaterThanOrEqual(0);
  const rest = PLUGIN_FS.slice(start + 1);
  const next = rest.search(/\n(?:async )?function |\nclass |\n\/\*\*/);
  const body = rest.slice(0, next === -1 ? undefined : next);
  const commands = [...body.matchAll(/plugin:fs\|(\w+)/g)].map((match) => match[1]!);
  expect(commands.length, `${functionName} invokes a plugin command`).toBeGreaterThan(0);
  return commands[0]!;
}

const permissionFor = (command: string) => `fs:allow-${command.replace(/_/g, '-')}`;

const grantedFsPermissions = () =>
  CAPABILITY.permissions.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('fs:')).sort();

describe('the fs plugin permissions are exactly what Clutter uses', { timeout: 30_000 }, () => {
  it('grants one permission per plugin function the source imports, and no more', () => {
    const needed = [...importedPluginFunctions()].map((name) => permissionFor(commandOf(name))).sort();

    expect(grantedFsPermissions()).toEqual([...new Set(needed)]);
  });

  it('grants none of the plugin\'s overwriting or write-opening commands, and no broad set that contains them', () => {
    const granted = grantedFsPermissions();

    for (const command of ['write_file', 'copy_file', 'create', 'truncate', 'ftruncate', 'write', 'open', 'watch', 'read', 'seek']) {
      expect(granted, command).not.toContain(permissionFor(command));
    }
    for (const broad of ['fs:default', 'fs:write-all', 'fs:read-all', 'fs:write-files', 'fs:allow-home-write-recursive', 'fs:allow-home-read-recursive', 'fs:allow-home-write', 'fs:allow-home-read']) {
      expect(granted, broad).not.toContain(broad);
    }
    expect(granted.some((permission) => /write-recursive|-all$|recursive$/.test(permission))).toBe(false);
  });

  it('keeps the scope the broad sets used to bring, as one explicit entry', () => {
    const scope = CAPABILITY.permissions.find((entry) => typeof entry === 'object' && entry.identifier === 'fs:scope') as { allow: string[] };

    expect(scope.allow).toEqual(['$HOME', '$HOME/**']);
  });
});
