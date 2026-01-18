#!/usr/bin/env node

/**
 * Update imports from @clutter/shared to @clutter/domain and @clutter/state
 *
 * Types → @clutter/domain
 * Stores → @clutter/state
 * Utils/hooks → @clutter/shared (unchanged)
 */

const fs = require('fs');
const path = require('path');

// Domain types that should be imported from @clutter/domain
const DOMAIN_TYPES = new Set([
  'Note',
  'Folder',
  'Tag',
  'User',
  'NoteMetadata',
  'ThemeMode',
  'CLUTTERED_FOLDER_ID',
  'DAILY_NOTES_FOLDER_ID',
]);

// Store exports that should be imported from @clutter/state
const STATE_EXPORTS = new Set([
  'useNotesStore',
  'useFoldersStore',
  'useTagsStore',
  'useOrderingStore',
  'useThemeStore',
  'useUiStateStore',
  'useConfirmationStore',
  'useFormDialogStore',
  'useCurrentDateStore',
  'initializeMidnightUpdater',
  'cleanupMidnightUpdater',
]);

function updateImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Skip if no @clutter/shared imports
  if (!content.includes("from '@clutter/shared'")) {
    return false;
  }

  let newContent = content;
  let changed = false;

  // Match all imports from @clutter/shared
  const importRegex =
    /import\s+(?:type\s+)?{([^}]+)}\s+from\s+'@clutter\/shared';/g;
  const matches = [...content.matchAll(importRegex)];

  matches.forEach((match) => {
    const fullImport = match[0];
    const imports = match[1].split(',').map((i) => i.trim());

    const domainImports = [];
    const stateImports = [];
    const sharedImports = [];

    imports.forEach((imp) => {
      // Handle "type X" and "X" formats
      const isType = imp.startsWith('type ');
      const name = isType ? imp.slice(5).trim() : imp;

      if (DOMAIN_TYPES.has(name)) {
        domainImports.push(isType ? `type ${name}` : name);
      } else if (STATE_EXPORTS.has(name)) {
        stateImports.push(name); // Never import stores as types
      } else {
        sharedImports.push(imp); // Keep original format
      }
    });

    let replacement = '';

    if (domainImports.length > 0) {
      replacement += `import { ${domainImports.join(', ')} } from '@clutter/domain';\n`;
    }
    if (stateImports.length > 0) {
      replacement += `import { ${stateImports.join(', ')} } from '@clutter/state';\n`;
    }
    if (sharedImports.length > 0) {
      replacement += `import { ${sharedImports.join(', ')} } from '@clutter/shared';\n`;
    }

    // Remove trailing newline from replacement to match original
    replacement = replacement.trimEnd();

    newContent = newContent.replace(fullImport, replacement);
    changed = true;
  });

  if (changed) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return true;
  }

  return false;
}

// Find all .ts and .tsx files in apps and packages
function findFiles(dir, extensions = ['.ts', '.tsx']) {
  let results = [];

  try {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (
        stat.isDirectory() &&
        !file.includes('node_modules') &&
        !file.includes('dist')
      ) {
        results = results.concat(findFiles(filePath, extensions));
      } else if (extensions.some((ext) => file.endsWith(ext))) {
        results.push(filePath);
      }
    });
  } catch (e) {
    // Skip directories we can't read
  }

  return results;
}

const rootDir = path.join(__dirname, '..');
const appsDir = path.join(rootDir, 'apps');
const packagesDir = path.join(rootDir, 'packages');

const files = [...findFiles(appsDir), ...findFiles(packagesDir)];

let updated = 0;

files.forEach((file) => {
  if (updateImportsInFile(file)) {
    console.log(`✓ Updated: ${path.relative(rootDir, file)}`);
    updated++;
  }
});

console.log(`\n✅ Updated ${updated} files`);
