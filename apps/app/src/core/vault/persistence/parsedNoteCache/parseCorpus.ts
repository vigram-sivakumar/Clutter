/**
 * Markdown used to prove cached and uncached ingestion are structurally
 * identical, and to pin parser output (golden test). Chosen so every optional
 * property on the parse result appears both present and absent: task
 * dueDate/completedAt, link and embed heading/blockReference/alias, plus the
 * frontmatter variants the parser distinguishes.
 */
export const GOLDEN_SAMPLES: Readonly<Record<string, string>> = {
  empty: '',
  'plain body': 'Just a line of text.\n',
  'heading only': '# Title\n',
  'no frontmatter, rich body':
    '# Title\n\nSome #tag and [[Other Note]] and ![[Embedded]].\n\n- [ ] open task\n- [x] done task\n',
  'frontmatter with id and title':
    '---\nid: 11111111-1111-4111-8111-111111111111\ntitle: A Note\n---\nBody text\n',
  'frontmatter, no id':
    '---\ntitle: No id here\ncreated: 2026-01-02T03:04:05.000Z\n---\n# Heading\n',
  'unterminated frontmatter':
    '---\nid: 22222222-2222-4222-8222-222222222222\nBody that never closes\n',
  'frontmatter only': '---\nid: 33333333-3333-4333-8333-333333333333\n---\n',
  'aliases and tags in frontmatter':
    '---\nid: 44444444-4444-4444-8444-444444444444\naliases:\n  - First Alias\n  - Second Alias\ntags:\n  - alpha\n  - beta\n---\nBody #inline\n',
  'inline flow aliases': '---\naliases: [One, Two]\ntags: [x, y]\n---\nBody\n',
  'unowned keys with nested lines':
    '---\nid: 55555555-5555-4555-8555-555555555555\ncustom: value\nnested:\n  child: 1\n  list:\n    - a\n    - b\nstatus: active\n---\nBody\n',
  'key casing variants':
    '---\nID: 66666666-6666-4666-8666-666666666666\nTitle: Cased\nTAGS: [q]\n---\nBody\n',
  'tasks with and without metadata':
    '- [ ] plain\n- [ ] due @due:2026-08-20\n- [x] done @completed:2026-08-04\n- [x] both @due:2026-08-01 @completed:2026-08-02\n- [ ] bare date @2026-09-09 here\n  - [ ] nested task\n',
  'links with every optional part':
    '[[A]] [[B#Heading]] [[C#^block]] [[D|Alias]] [[E#Heading|Alias]] [[F#^blk|Alias]]\n',
  'embeds with every optional part':
    '![[A]] ![[B#Heading]] ![[C#^block]] ![[D|300]] ![[E#Heading|Alias]]\n',
  'block references and headings':
    '# One\n\n## Two\n\n### Three\n\nParagraph ^para1\n\n- item ^item1\n\n#### Four\n',
  'tags in code are ignored':
    'Real #real tag\n\n```\n#not-a-tag [[not-a-link]] - [ ] not a task\n```\n\n`#inline-code` #after\n',
  'crlf line endings':
    '---\r\nid: 77777777-7777-4777-8777-777777777777\r\n---\r\n# Title\r\n\r\n- [ ] task\r\n',
  'unicode and emoji': '# Café ☕\n\nNaïve #日本語 and 😀 [[Ünïcode]]\n',
  'duplicate id a':
    '---\nid: 88888888-8888-4888-8888-888888888888\n---\nFirst copy\n',
  'duplicate id b':
    '---\nid: 88888888-8888-4888-8888-888888888888\n---\nSecond copy\n',
  'template marker and archive-ish':
    '---\nid: 99999999-9999-4999-8999-999999999999\ntemplate: true\narchived: true\n---\nBody\n',
  'tables and quotes': '| a | b |\n|---|---|\n| 1 | 2 |\n\n> quote #qtag\n',
  'cover credit, valid':
    '---\nid: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\ncover: https://images.unsplash.com/photo-1?w=1080\ncoverCredit: Jane Doe <https://unsplash.com/@jane?utm_source=clutter&utm_medium=referral>\n---\nBody\n',
  'cover credit, with download location':
    '---\nid: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\ncover: https://images.unsplash.com/photo-2?w=1080\ncoverCredit: Jane Doe <https://unsplash.com/@jane?utm_source=clutter&utm_medium=referral> <https://api.unsplash.com/photos/abc/download?ixid=xyz>\n---\nBody\n',
  'cover credit, malformed (no profile url)':
    '---\ncover: https://images.unsplash.com/photo-3\ncoverCredit: Jane Doe\n---\nBody\n',
  'cover credit, non-https profile url':
    '---\ncoverCredit: Jane Doe <http://unsplash.com/@jane>\n---\nBody\n',
  'cover credit, empty value': '---\ncoverCredit:\n---\nBody\n',
  'cover without credit':
    '---\ncover: https://images.unsplash.com/photo-4\ncoverHidden: false\n---\nBody\n',
  'long paragraph with many links':
    Array.from({ length: 40 }, (_, i) => `[[Target ${i}]] #t${i % 5}`).join(
      ' '
    ) + '\n',
};

/** A deterministic generated vault: `count` notes spread over folders. */
export function generateVault(
  count: number,
  root: string
): Record<string, string> {
  const files: Record<string, string> = {};
  const names = Array.from(
    { length: count },
    (_, i) => `Note ${String(i).padStart(4, '0')}`
  );
  const sampleKeys = Object.keys(GOLDEN_SAMPLES).filter(
    (key) => !key.startsWith('duplicate id')
  );
  for (let i = 0; i < count; i += 1) {
    const folder = `${root}/Folder ${String(i % 7).padStart(2, '0')}`;
    const link = `[[${names[(i * 7 + 3) % count]}]]`;
    const tag = `#tag${i % 11}`;
    const task =
      i % 3 === 0
        ? `- [ ] task ${i} @due:2026-0${(i % 9) + 1}-1${i % 9}`
        : `- [x] task ${i}`;
    const sample = GOLDEN_SAMPLES[sampleKeys[i % sampleKeys.length]!]!;
    const id = `${String(i).padStart(8, '0')}-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const withId = i % 4 === 0 ? '' : `id: ${id}\n`;
    files[`${folder}/${names[i]}.md`] =
      `---\n${withId}title: ${names[i]}\n---\n# ${names[i]}\n\n${link} ${tag}\n\n${task}\n\n${sample.includes('---\n') ? '' : sample}`;
  }
  return files;
}
