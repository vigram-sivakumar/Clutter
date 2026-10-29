import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-063, decision 11: every text write into a vault says what it means (`create`, `replace`, `upsert`,
 * `{ replaceIf }`), because the atomic writer refuses to guess. This guards the call sites: a new
 * `fileSystem.writeFile(path, contents)` with no intent fails here instead of silently meaning "whatever".
 */
const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The number of top-level arguments of the call whose opening parenthesis is at `open`. */
function argumentCount(text: string, open: number): number {
  let depth = 0;
  let count = 1;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) return count;
    } else if (char === ',' && depth === 1) count += 1;
  }
  return count;
}

describe('every vault text write states its intent', () => {
  it('passes an intent to every fileSystem.writeFile call outside the providers', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith(join('core', 'vault', 'providers')) || rel.includes('testing')) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/[fF]ileSystem\.writeFile\(/g)) {
        const open = match.index! + match[0].length - 1;
        if (argumentCount(text, open) < 3) {
          missing.push(`${rel}:${text.slice(0, match.index).split('\n').length}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
