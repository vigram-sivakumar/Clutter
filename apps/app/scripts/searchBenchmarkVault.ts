/**
 * Seeded synthetic vault for the search benchmarks: deterministic, ~5 KB notes (the size of ADR-053's 1,000-note
 * benchmark) with headings, lists, tasks, links, wiki links, code, tags, and (unless `ascii`) some non-ASCII text.
 */
/** Small deterministic PRNG (mulberry32), so a given size always builds the same vault. */
export function random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ['ba', 'ko', 'ri', 'mu', 'te', 'sa', 'lo', 'vi', 'pe', 'na', 'do', 'fu', 'ge', 'hi', 'jo', 'ze'];
const NON_ASCII_WORDS = ['café', 'naïve', 'señor', 'über', 'ﬁnal', '한국어', 'résumé', 'façade', 'Ångström', '日本語'];

function makeVocabulary(next: () => number, size: number): string[] {
  const words = new Set<string>();

  while (words.size < size) {
    const length = 2 + Math.floor(next() * 3);
    let word = '';

    for (let i = 0; i < length; i++) word += SYLLABLES[Math.floor(next() * SYLLABLES.length)];
    words.add(word);
  }

  return [...words];
}

export interface SyntheticPage {
  readonly id: string;
  readonly title: string;
  readonly aliases: string[];
  readonly tags: string[];
  readonly markdown: string;
  readonly updatedAt: string;
}

/** Zipf-ish: low indices are far more common, like real prose. */
function pick(next: () => number, words: readonly string[]): string {
  return words[Math.floor(words.length * next() ** 3)]!;
}

export function makeVault(count: number, options: { ascii?: boolean } = {}): { pages: SyntheticPage[]; commonWord: string; rareWord: string; titleWord: string } {
  const next = random(count);
  const words = makeVocabulary(next, 4000);
  const commonWord = words[3]!;
  const titleWord = words[900]!;
  const rareWord = 'zzquokka';
  const pages: SyntheticPage[] = [];

  for (let n = 0; n < count; n++) {
    const sentence = (): string => {
      const parts: string[] = [];
      const length = 6 + Math.floor(next() * 12);

      for (let i = 0; i < length; i++) {
        let word = pick(next, words);
        const roll = next();

        if (roll < 0.04) word = `**${word}**`;
        else if (roll < 0.07) word = `*${word}*`;
        else if (roll < 0.09) word = `[${word}](https://example.com/${pick(next, words)}/${n})`;
        else if (roll < 0.1) word = `[[${pick(next, words)}|${word}]]`;
        else if (roll < 0.12) word = `\`${word}\``;
        else if (roll < 0.125 && !options.ascii) word = NON_ASCII_WORDS[Math.floor(next() * NON_ASCII_WORDS.length)]!;
        parts.push(word);
      }

      return `${parts.join(' ')}.`;
    };

    const blocks: string[] = [`# ${pick(next, words)} ${pick(next, words)}`];
    const target = 4200 + Math.floor(next() * 1600); // ≈ 5 KB, the size of ADR-053's 1,000-note benchmark
    let size = blocks[0]!.length;

    while (size < target) {
      const roll = next();
      let block: string;

      if (roll < 0.5) block = sentence() + ' ' + sentence();
      else if (roll < 0.7) block = `- [${next() < 0.3 ? 'x' : ' '}] ${sentence()}\n- ${sentence()}`;
      else if (roll < 0.8) block = `## ${pick(next, words)}\n\n${sentence()}`;
      else if (roll < 0.88) block = `\`\`\`ts\nconst ${pick(next, words)} = "${pick(next, words)}";\n\`\`\``;
      else if (roll < 0.94) block = `> ${sentence()}`;
      else block = `#${pick(next, words)} ${sentence()}`;

      blocks.push(block);
      size += block.length + 2;
    }

    if (n % 1000 === 7) blocks.push(`unique ${rareWord} marker`);
    // About 30% of notes mention the common word, 3% carry it in the title.
    if (n % 10 < 3) blocks.push(`mentions ${commonWord} somewhere`);

    pages.push({
      id: `page-${n}`,
      title: `${n % 33 === 0 ? titleWord + ' ' : ''}${pick(next, words)} ${pick(next, words)}`,
      aliases: n % 5 === 0 ? [pick(next, words)] : [],
      tags: n % 3 === 0 ? [pick(next, words), `${pick(next, words)}-${pick(next, words)}`] : [],
      markdown: blocks.join('\n\n') + '\n',
      updatedAt: new Date(1_700_000_000_000 + n * 60_000).toISOString(),
    });
  }

  return { pages, commonWord, rareWord, titleWord };
}

