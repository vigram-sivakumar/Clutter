import { describe, expect, it } from 'vitest';
import {
  BodyText,
  classify,
  confirmBody,
  highlightRanges,
  parseQuery,
  recencyPoints,
  tokenMatches,
  withinEdits,
  withinOneEdit,
  type Classification,
  type FoldedMeta,
} from './matchPage';
import { foldString } from './foldText';

interface Fields {
  title?: string;
  aliases?: string[];
  headings?: string[];
  tags?: string[];
}

const meta = (fields: Fields = {}): FoldedMeta => ({
  title: foldString(fields.title ?? 'Untitled'),
  aliases: (fields.aliases ?? []).map(foldString),
  headings: (fields.headings ?? []).map(foldString),
  tags: (fields.tags ?? []).map((tag) => foldString(tag).replace(/[-_]+/g, ' ')),
});

function classification(query: string, fields: Fields, markdown = '', recency = 0): Classification | null {
  return classify(parseQuery(query)!, meta(fields), new BodyText(markdown), recency);
}

const scoreOf = (query: string, fields: Fields, markdown = ''): number => classification(query, fields, markdown)!.score;

/** The Markdown text a snippet's reveal range covers. */
function revealed(markdown: string, query: string): string[] {
  const parsed = parseQuery(query)!;
  const body = new BodyText(markdown);

  return confirmBody(parsed, body).snippets.map((snippet) => body.markdown.slice(snippet.range.from, snippet.range.to));
}

describe('parseQuery', () => {
  it('folds, splits and de-duplicates words', () => {
    expect(parseQuery('  Café  CAFÉ plan ')!.tokens).toEqual(['cafe', 'plan']);
  });

  it('returns null for an empty query', () => {
    expect(parseQuery('   ')).toBeNull();
    expect(parseQuery('')).toBeNull();
  });
});

describe('the matching rule for a word', () => {
  it('lets a one- or two-letter word match only at the start of a word', () => {
    expect(tokenMatches('new note', 'n')).toBe(true);
    expect(tokenMatches('banana', 'n')).toBe(false);
    expect(tokenMatches('a banana and a note', 'no')).toBe(true);
    expect(tokenMatches('anonymous', 'no')).toBe(false);
  });

  it('lets a longer word match inside a word too', () => {
    expect(tokenMatches('roadmap', 'map')).toBe(true);
  });
});

describe('relevance — where a page matches', () => {
  it('ranks title above alias above tag above heading above the body phrase above a match spread over several places', () => {
    const title = scoreOf('design', { title: 'Design' }, 'design');
    const alias = scoreOf('design', { title: 'x', aliases: ['Design'] }, 'design');
    const tag = scoreOf('design', { title: 'x', tags: ['design'] }, 'design');
    const heading = scoreOf('design', { title: 'x', headings: ['Design'] }, '');
    const bodyPhrase = scoreOf('design', { title: 'x' }, 'about design');
    const spread = scoreOf('design plan', { title: 'x design' }, 'the plan');

    expect(title).toBeGreaterThan(alias);
    expect(alias).toBeGreaterThan(tag);
    expect(tag).toBeGreaterThan(heading);
    expect(heading).toBeGreaterThan(bodyPhrase);
    expect(bodyPhrase).toBeGreaterThan(spread);
  });

  it('reports which place it matched', () => {
    expect(classification('design', { title: 'Design' })!.cls).toBe('title');
    expect(classification('design', { title: 'x', aliases: ['Design'] })!.cls).toBe('alias');
    expect(classification('design', { title: 'x', headings: ['Design'] })!.cls).toBe('heading');
    expect(classification('design', { title: 'x', tags: ['design'] })!.cls).toBe('tag');
    expect(classification('design', { title: 'x' }, 'about design')!.cls).toBe('body');
  });

  it('ranks a better title match above a worse one', () => {
    const exact = scoreOf('road', { title: 'Road' });
    const prefix = scoreOf('road', { title: 'Roadmap' });
    const wordStart = scoreOf('road', { title: 'Site road' });
    const inside = scoreOf('road', { title: 'Broadroad' });

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inside);
  });

  it('ranks a title match above an exact phrase in the body, however weak the title match is', () => {
    const phraseInBody = scoreOf('map road', { title: 'Untitled' }, 'we saw a map road sign today');
    const exactTitle = scoreOf('map road', { title: 'Map road' });
    // "map" and "road" both inside one title word, out of order: the weakest kind of exact title match.
    const weakestTitle = scoreOf('map road', { title: 'Roadmapping' });
    const substringTitle = scoreOf('map road', { title: 'Maproad' });

    expect(exactTitle).toBeGreaterThan(phraseInBody);
    expect(substringTitle).toBeGreaterThan(phraseInBody);
    expect(weakestTitle).toBeGreaterThan(phraseInBody);
  });

  it('ranks a close (typo) title above an exact phrase in the body', () => {
    const closeTitle = classification('Naw note', { title: 'New note' })!;
    const phraseInBody = classification('Naw note', { title: 'Elsewhere' }, 'the exact phrase naw note appears here')!;

    expect(closeTitle.fuzzy).toBe(true);
    expect(closeTitle.score).toBeGreaterThan(phraseInBody.score);
  });

  it('ranks every exact title match above every close title match, even a far fresher one', () => {
    const fresh = recencyPoints(Date.now(), Date.now());
    const closest = classification('Project plan', { title: 'Projekt plan' }, '', fresh)!; // one letter off, fully matching otherwise
    const weakestExact = classification('map road', { title: 'Roadmapping' }, '', 0)!;
    const exact = classification('Project plan', { title: 'Project plan' }, '', 0)!;

    expect(closest.fuzzy).toBe(true);
    expect(exact.score).toBeGreaterThan(closest.score);
    expect(weakestExact.score).toBeGreaterThan(closest.score);
  });

  it('keeps the places in order: exact title, title prefix, word prefix, substring, close title, exact alias, close alias, tag, heading or body phrase, nearby words, weaker body', () => {
    const query = 'new note';
    const scores = [
      scoreOf(query, { title: 'New note' }), // 1 exact title
      scoreOf(query, { title: 'New note ideas' }), // 2 title prefix
      scoreOf(query, { title: 'My new notes' }), // 3 title word prefix
      scoreOf(query, { title: 'Renew notes' }), // 4 title substring
      scoreOf(query, { title: 'Nxw note' }), // 5 close title
      scoreOf(query, { title: 'Other', aliases: ['New note'] }), // 6 exact alias
      scoreOf(query, { title: 'Other', aliases: ['Naw note'] }), // 7 close alias
      scoreOf(query, { title: 'Other', tags: ['new note'] }), // 7 tag
      scoreOf(query, { title: 'Other', headings: ['New note'] }), // 8 phrase in a heading
      scoreOf(query, { title: 'Other' }, 'we wrote new note today'), // 8 phrase in the body
      scoreOf(query, { title: 'Other' }, 'a note about something new'), // 9 nearby words in the body
      scoreOf(query, { title: 'Other' }, `a new beginning ${'filler words '.repeat(30)} for this note`), // 10 weaker body
    ];

    for (let index = 1; index < scores.length; index++) {
      expect(scores[index - 1], `place ${index} above place ${index + 1}`).toBeGreaterThan(scores[index]!);
    }
  });

  it('ranks words close together in the body above words far apart', () => {
    const adjacent = scoreOf('meeting agenda', { title: 'x' }, 'the meeting agenda is attached');
    const near = scoreOf('meeting agenda', { title: 'x' }, 'the agenda for the weekly meeting');
    const far = scoreOf('meeting agenda', { title: 'x' }, `a meeting ${'filler words '.repeat(30)} and an agenda`);
    const separateLines = scoreOf('meeting agenda', { title: 'x' }, 'the meeting\n\nthe agenda');

    expect(adjacent).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(separateLines);
    expect(near).toBeGreaterThan(separateLines);
  });

  it('does not let repeating a word raise a score', () => {
    const once = scoreOf('meeting', { title: 'x' }, 'one meeting here');
    const hundred = scoreOf('meeting', { title: 'x' }, 'meeting '.repeat(100));
    const titled = scoreOf('meeting', { title: 'Meeting notes' }, 'nothing relevant');

    expect(hundred).toBe(once);
    expect(titled).toBeGreaterThan(hundred);
  });

  it('uses recency only as a small tie-breaker', () => {
    const base = scoreOf('plan', { title: 'Plan' });
    const fresh = classification('plan', { title: 'Plan' }, '', recencyPoints(Date.now(), Date.now()))!.score;
    const weakButFresh = classification('plan', { title: 'Replanning' }, '', recencyPoints(Date.now(), Date.now()))!.score;

    expect(fresh - base).toBeLessThanOrEqual(5);
    expect(fresh).toBeGreaterThan(weakButFresh);
    expect(recencyPoints(0, Date.now())).toBe(0);
    expect(recencyPoints(Date.now() - 365 * 86_400_000, Date.now())).toBeLessThan(0.1);
  });

  it('requires every word', () => {
    expect(classification('alpha beta', { title: 'alpha' }, 'gamma')).toBeNull();
    expect(classification('alpha beta', { title: 'beta alpha' })!.cls).toBe('title');
  });

  it('is case- and diacritic-insensitive', () => {
    expect(classification('CAFE', { title: 'Café' })!.cls).toBe('title');
    expect(classification('café', { title: 'cafe' })!.cls).toBe('title');
  });

  it('finds a note by a tag it carries, and by an alias', () => {
    expect(classification('product design', { title: 'x', tags: ['product-design'] })!.cls).toBe('tag');
    expect(classification('uxd', { title: 'User experience', aliases: ['UXD', 'usability'] })!.cls).toBe('alias');
  });
});

describe('partial queries', () => {
  const NOTE = { title: 'New note' };

  it('"New" prefers titles that begin with New', () => {
    expect(scoreOf('new', NOTE)).toBeGreaterThan(scoreOf('new', { title: 'My new idea' }));
    expect(scoreOf('new', { title: 'My new idea' })).toBeGreaterThan(scoreOf('new', { title: 'Renewal' }));
  });

  it('"New n" strongly favors titles that begin with "New n" and does not match every n', () => {
    expect(classification('New n', NOTE)).not.toBeNull();
    expect(scoreOf('New n', NOTE)).toBeGreaterThan(scoreOf('New n', { title: 'Renewing notes' }));
    expect(scoreOf('New n', NOTE)).toBeGreaterThan(scoreOf('New n', { title: 'Brand new, not yet' }));

    // The unfinished letter is not a license to match an n inside a word, in a title or in a body.
    expect(classification('New n', { title: 'New banana' })).toBeNull();
    expect(classification('New n', { title: 'x' }, 'a brand new banana, anyone')).toBeNull();
    expect(classification('New n', { title: 'x' }, 'a brand new note for anyone')).not.toBeNull();
  });

  it('does not satisfy two words with one occurrence: "New n" needs another word besides "new"', () => {
    expect(classification('New n', { title: 'New' })).toBeNull();
    expect(classification('New n', { title: 'x' }, 'only the word new here')).toBeNull();
  });

  it('"New no" strongly favors "New note" and "New notebook"', () => {
    const note = scoreOf('New no', NOTE);
    const notebook = scoreOf('New no', { title: 'New notebook' });
    const noise = scoreOf('New no', { title: 'Renewal notice' });

    expect(note).toBeGreaterThan(noise);
    expect(notebook).toBeGreaterThan(noise);
    expect(classification('New no', { title: 'New banana' })).toBeNull();
  });

  it('"New note" prefers the exact title, then the phrase, then close variations', () => {
    const exact = scoreOf('New note', { title: 'New note' });
    const prefix = scoreOf('New note', { title: 'New note ideas' });
    const phrase = scoreOf('New note', { title: 'My new notes' });
    const apart = scoreOf('New note', { title: 'A note about something new' });

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(phrase);
    expect(phrase).toBeGreaterThan(apart);
  });
});

describe('typo tolerance', () => {
  it('counts a swap, a substitution, an insertion and a deletion as one edit', () => {
    expect(withinOneEdit('project', 'proejct')).toBe(true); // swap
    expect(withinOneEdit('meeting', 'meating')).toBe(true); // substitution
    expect(withinOneEdit('meeting', 'metting')).toBe(true); // deletion
    expect(withinOneEdit('meeting', 'meetting')).toBe(true); // insertion
    expect(withinOneEdit('meeting', 'metng')).toBe(false); // two edits
    expect(withinOneEdit('abc', 'abc')).toBe(true);
    expect(withinOneEdit('abc', 'bca')).toBe(false);
  });

  it('"Naw note" finds "New note" as a close match', () => {
    const found = classification('Naw note', { title: 'New note' })!;

    expect(found.cls).toBe('title');
    expect(found.fuzzy).toBe(true);
  });

  it('"Proejct plan" finds "Project plan" and "Metting notes" finds "Meeting notes"', () => {
    expect(classification('Proejct plan', { title: 'Project plan' })).toMatchObject({ cls: 'title', fuzzy: true });
    expect(classification('Metting notes', { title: 'Meeting notes' })).toMatchObject({ cls: 'title', fuzzy: true });
  });

  it('finds an alias by a typo too', () => {
    expect(classification('Proejct', { title: 'Plans', aliases: ['Project'] })).toMatchObject({ cls: 'alias', fuzzy: true });
  });

  it('an exact title always outranks a close one, however recent the close one is', () => {
    const exact = classification('Project plan', { title: 'Project plan' }, '', 0)!;
    const close = classification('Project plan', { title: 'Projekt plan' }, '', recencyPoints(Date.now(), Date.now()))!;
    const closeOnly = classification('Proejct plan', { title: 'Project plan' }, '', recencyPoints(Date.now(), Date.now()))!;

    expect(exact.fuzzy).toBe(false);
    expect(close.fuzzy).toBe(true);
    expect(exact.score).toBeGreaterThan(close.score);
    expect(exact.score).toBeGreaterThan(closeOnly.score);
  });

  it('a close title outranks an exact alias and an exact body phrase, but never an exact title', () => {
    const fresh = recencyPoints(Date.now(), Date.now());
    const close = classification('Proejct plan', { title: 'Project plan' }, '', fresh)!;
    const phrase = classification('proejct plan', { title: 'Other' }, 'we wrote proejct plan once')!;
    const alias = classification('proejct plan', { title: 'Other', aliases: ['Proejct plan'] })!;
    const exactTitle = classification('proejct plan', { title: 'Proejct plan' })!;

    expect(close.score).toBeGreaterThan(alias.score);
    expect(close.score).toBeGreaterThan(phrase.score);
    expect(exactTitle.score).toBeGreaterThan(close.score);
  });

  it('never applies to one- or two-letter words', () => {
    expect(classification('xq', { title: 'xz' })).toBeNull();
    expect(classification('a', { title: 'b' })).toBeNull();
    expect(classification('ne', { title: 'new note' })!.fuzzy).toBe(false); // exact (a prefix), not close
    expect(classification('nx', { title: 'new note' })).toBeNull();
  });

  it('does not compare a short word with the start of a longer one: "new" is not a typo of "nesting"', () => {
    expect(classification('new', { title: 'Multi level nesting' })).toBeNull();
    expect(classification('new', { title: 'Nex' })).toMatchObject({ fuzzy: true }); // a whole word one edit away
    // From five letters on, a typo in what has been typed so far of a longer word is tolerated.
    expect(classification('proejc', { title: 'Project plan' })).toMatchObject({ cls: 'title', fuzzy: true });
    expect(classification('proe', { title: 'Project plan' })).toBeNull();
  });

  it('does not stretch to two edits or to a different first letter', () => {
    expect(classification('metng', { title: 'Meeting' })).toBeNull(); // two edits
    expect(classification('xeeting', { title: 'Meeting' })).toBeNull(); // wrong first letter
  });

  it('needs every word to match, exactly or by a typo: one close word cannot carry a query', () => {
    expect(classification('Proejct banana', { title: 'Project plan' })).toBeNull();
    expect(classification('Naw zebra', { title: 'New note' })).toBeNull();
  });

  it('applies to titles and aliases only — not to the body, headings or tags', () => {
    expect(classification('proejct', { title: 'x' }, 'the project plan')).toBeNull();
    expect(classification('proejct', { title: 'x', headings: ['Project'] }, '')).toBeNull();
    expect(classification('proejct', { title: 'x', tags: ['project'] }, '')).toBeNull();
  });

  it('does not use one title word for two query words', () => {
    expect(classification('naw new', { title: 'New' })).toBeNull();
  });

  it('keeps a page that matched a close title when its better-looking body match turns out not to be real', () => {
    // The body "matches" in the prefilter only through a link destination; the title is a close match.
    const found = classification('Proejct', { title: 'Project' }, '[x](https://proejct.example)')!;

    expect(found.fuzzy || found.fallback?.fuzzy).toBe(true);
  });
});

describe('daily notes', () => {
  it('are found by the way the app writes their date, as titles', () => {
    const dateText = '2026-08-24 mon, 24 august 2026 august 24, 2026 monday';

    expect(classification('aug 24', { title: dateText })!.cls).toBe('title');
    expect(classification('monday', { title: dateText })!.cls).toBe('title');
    expect(classification('2026-08', { title: dateText })!.cls).toBe('title');
  });
});

describe('confirmBody — visible text only', () => {
  it('does not match words that only appear in a link destination', () => {
    const body = new BodyText('read [the docs](https://secret.example.com/path)');
    const result = confirmBody(parseQuery('secret')!, body);

    expect(result.present).toEqual([false]);
    expect(result.snippets).toEqual([]);
  });

  it('does not match formatting delimiters or fence language tags', () => {
    expect(confirmBody(parseQuery('typescript')!, new BodyText('```typescript\nlet a = 1\n```')).present).toEqual([false]);
    expect(confirmBody(parseQuery('**')!, new BodyText('a **bold** word')).present).toEqual([false]);
  });

  it('matches code content', () => {
    const body = new BodyText('```ts\nconst needleValue = 1;\n```');

    expect(confirmBody(parseQuery('needlevalue')!, body).present).toEqual([true]);
  });

  it('matches a word split by formatting delimiters', () => {
    const markdown = 'a bo**ld** statement';

    expect(classification('bold', { title: 'x' }, markdown)!.cls).toBe('body');
    expect(revealed(markdown, 'bold')).toEqual(['bo**ld']);
  });

  it('matches a word in a task, a table and a wiki link alias', () => {
    expect(confirmBody(parseQuery('milk')!, new BodyText('- [ ] buy milk')).present).toEqual([true]);
    expect(confirmBody(parseQuery('beta')!, new BodyText('| alpha | beta |\n|---|---|\n| 1 | 2 |')).present).toEqual([true]);
    expect(confirmBody(parseQuery('shown')!, new BodyText('see [[hidden/target|shown]]')).present).toEqual([true]);
    expect(confirmBody(parseQuery('hidden')!, new BodyText('see [[hidden/target|shown]]')).present).toEqual([false]);
  });

  it('does not count a one-letter word that only occurs inside other words', () => {
    expect(confirmBody(parseQuery('n')!, new BodyText('banana bandana')).present).toEqual([false]);
    expect(confirmBody(parseQuery('n')!, new BodyText('banana note')).present).toEqual([true]);
  });
});

describe('confirmBody — snippets', () => {
  it('returns the best passages first: the phrase, then lines with the most words — not the first lines of the note', () => {
    const markdown = [
      'alpha only at the very top',
      'filler',
      'alpha and beta together',
      'filler',
      'the exact alpha beta phrase',
      'filler',
      'beta alone',
    ].join('\n\n');
    const { snippets, moreMatches } = confirmBody(parseQuery('alpha beta')!, new BodyText(markdown));

    expect(snippets.map((snippet) => snippet.text)).toEqual([
      'the exact alpha beta phrase',
      'alpha and beta together',
      'alpha only at the very top',
    ]);
    expect(moreMatches).toBe(1);
  });

  it('shows the passage around a match deep in a long note', () => {
    const lines = Array.from({ length: 900 }, (_, i) => `ordinary line number ${i} with nothing special`);
    lines[817] = 'the meeting agenda is on this line';
    const body = new BodyText(lines.join('\n'));
    const { snippets } = confirmBody(parseQuery('meeting agenda')!, body);

    expect(snippets[0]!.text).toBe('the meeting agenda is on this line');
    expect(body.markdown.slice(snippets[0]!.range.from, snippets[0]!.range.to)).toBe('meeting agenda');
  });

  it('shows visible text, not Markdown, and highlights the matched phrase or word in it', () => {
    const { snippets } = confirmBody(parseQuery('plan')!, new BodyText('## The **Plan** for [launch](http://x.example)'));

    expect(snippets).toHaveLength(1);
    expect(snippets[0]!.text).toBe('The Plan for launch');
    expect(snippets[0]!.highlights).toEqual([{ from: 4, to: 8 }]);
  });

  it('highlights a typed phrase as one span, not each word', () => {
    const { snippets } = confirmBody(parseQuery('new note')!, new BodyText('create a new note today, a new idea, a note'));
    const text = snippets[0]!.text;

    expect(snippets[0]!.highlights.map((range) => text.slice(range.from, range.to))).toEqual(['new note']);
  });

  it('never highlights isolated letters for an unfinished word', () => {
    const { snippets } = confirmBody(
      parseQuery('new n')!,
      new BodyText('a new note: the nuance and the rain and the sun, new needs now')
    );
    const text = snippets[0]!.text;
    const marked = snippets[0]!.highlights.map((range) => text.slice(range.from, range.to));

    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((piece) => piece.length >= 3)).toBe(true);
    expect(marked).toContain('new n');
  });

  it('windows a long line around the match', () => {
    const line = `${'word '.repeat(80)}needle ${'tail '.repeat(80)}`;
    const { snippets } = confirmBody(parseQuery('needle')!, new BodyText(line));
    const text = snippets[0]!.text;

    expect(text.length).toBeLessThan(140);
    expect(text).toContain('needle');
    expect(text.startsWith('…')).toBe(true);
    expect(text.endsWith('…')).toBe(true);
    expect(snippets[0]!.highlights.map((range) => text.slice(range.from, range.to))).toEqual(['needle']);
  });
});

describe('confirmBody — ranges into the original document', () => {
  it('points at the matched text after Unicode folds that change length', () => {
    const markdown = 'ﬁnal ½ cup of 한국어 and 𝒜𝒜 then the NEEDLE here';

    expect(revealed(markdown, 'needle')).toEqual(['NEEDLE']);
    expect(revealed(markdown, 'cup')).toEqual(['cup']);
  });

  it('points at the matched text after escapes and wiki links', () => {
    const markdown = 'Escaped \\* star and [[a/b|alias]] then target';

    expect(revealed(markdown, 'target')).toEqual(['target']);
    expect(revealed(markdown, 'alias')).toEqual(['alias']);
  });

  it('points at the right text in a CRLF document, in editor-document offsets', () => {
    const crlf = 'one\r\ntwo **bold**\r\nthree needle\r\nfour\r\n';
    const body = new BodyText(crlf);
    const range = confirmBody(parseQuery('needle')!, body).snippets[0]!.range;

    // The editor splits on CRLF, so its document is the LF text.
    expect(body.markdown).toBe('one\ntwo **bold**\nthree needle\nfour\n');
    expect(body.markdown.slice(range.from, range.to)).toBe('needle');
  });

  it('points at a match spanning segments (a word split by formatting and a link)', () => {
    const markdown = 'the **qui**[ck](http://x.example) fox jumps';

    expect(revealed(markdown, 'quick')).toEqual(['qui**[ck']);
  });

  it('covers a typed phrase in the document, delimiters between its words included', () => {
    expect(revealed('create a **new** note today', 'new note')).toEqual(['new** note']);
  });

  it('keeps every range correct in a document that mixes all of these', () => {
    const markdown = [
      '# ﬁrst **Heading**',
      '',
      '- [ ] ½ task with `code` and [[x|ALIAS]]',
      '',
      '```js',
      'const unique_word = "𝒜";',
      '```',
    ].join('\r\n');
    const body = new BodyText(markdown);

    for (const word of ['heading', 'task', 'code', 'alias', 'unique_word']) {
      const range = confirmBody(parseQuery(word)!, body).snippets[0]!.range;

      expect(body.markdown.slice(range.from, range.to).toLowerCase().replace(/[*`]/g, '')).toContain(word);
    }
  });
});

describe('highlightRanges', () => {
  it('returns merged ranges in the text it was given, Unicode-safe', () => {
    const text = 'ﬁnal Café and Plan';

    expect(highlightRanges(text, ['cafe', 'plan']).map((range) => text.slice(range.from, range.to))).toEqual([
      'Café',
      'Plan',
    ]);
  });

  it('highlights the word that was meant when a title was found by a typo — and only then', () => {
    expect(highlightRanges('New note', ['naw', 'note'], true).map((range) => 'New note'.slice(range.from, range.to))).toEqual([
      'New',
      'note',
    ]);
    expect(highlightRanges('New note', ['naw', 'note'])).toEqual([{ from: 4, to: 8 }]);
  });
});

describe('which fields a query reaches', () => {
  const everywhere: Fields = { title: 'Unrelated', aliases: ['tango'], tags: ['tea'], headings: ['top'] };
  const body = 'tomato soup, a test, a teapot';

  it('one character searches titles only', () => {
    expect(classification('t', { ...everywhere }, body)).toBeNull();
    expect(classification('t', { title: 'Tea time' }, body)).toMatchObject({ cls: 'title' });
  });

  it('two characters search titles only', () => {
    expect(classification('te', { ...everywhere }, body)).toBeNull();
    expect(classification('te', { title: 'Tea time' }, body)).toMatchObject({ cls: 'title' });
  });

  it('two characters with a space between them (T e) search titles only', () => {
    expect(classification('T e', { ...everywhere }, 'the end, tea, then eggs')).toBeNull();
    expect(classification('T e', { title: 'Tea eggs' })).toMatchObject({ cls: 'title' });
    expect(parseQuery('T e')!.titleOnly).toBe(true);
  });

  it('three characters search titles, aliases, tags and the visible body', () => {
    expect(classification('tes', { title: 'Testing' })).toMatchObject({ cls: 'title' });
    expect(classification('tes', { title: 'x', aliases: ['Tester'] })).toMatchObject({ cls: 'alias' });
    expect(classification('tes', { title: 'x', tags: ['testing'] })).toMatchObject({ cls: 'tag' });
    expect(classification('tes', { title: 'x', headings: ['Test plan'] })).toMatchObject({ cls: 'heading' });
    expect(classification('tes', { title: 'x' }, 'a test of the body')).toMatchObject({ cls: 'body' });
    expect(parseQuery('Tes')!.titleOnly).toBe(false);
  });

  it('"New n" (four characters) searches every field', () => {
    expect(parseQuery('New n')!.titleOnly).toBe(false);
    expect(classification('New n', { title: 'x' }, 'a brand new note')).toMatchObject({ cls: 'body' });
    expect(classification('New n', { title: 'x', tags: ['new notes'] })).toMatchObject({ cls: 'tag' });
  });

  it('counts characters, not words or bytes: spaces do not count, a letter with an accent is one', () => {
    expect(parseQuery('  a  b  ')!.titleOnly).toBe(true);
    expect(parseQuery('é')!.titleOnly).toBe(true);
    expect(parseQuery('e\u0301e\u0301')!.titleOnly).toBe(true);
    expect(parseQuery('ab ab')!.titleOnly).toBe(false); // four characters, even though one word repeats
    expect(parseQuery('日本語')!.titleOnly).toBe(false);
    expect(parseQuery('日本')!.titleOnly).toBe(true);
  });

  it('whitespace only is no query at all', () => {
    for (const blank of ['', ' ', '   ', '\t', '\n  \t ']) {
      expect(parseQuery(blank)).toBeNull();
    }
  });

  it('never tolerates a typo in a query shorter than three characters', () => {
    expect(classification('te', { title: 'ta' })).toBeNull();
    expect(classification('t e', { title: 'x y' })).toBeNull();
    // From three characters a typo is tolerated: the same kind of title now matches.
    expect(classification('tes', { title: 'tas' })).toMatchObject({ cls: 'title', fuzzy: true });
  });
});

describe('typo tolerance — two edits for long words', () => {
  it('allows one edit for words of three to five letters and two from six', () => {
    expect(withinEdits('proejct', 'project', 2)).toBe(true);
    expect(withinEdits('mettng', 'meeting', 2)).toBe(true); // an insertion and a substitution
    expect(withinEdits('metng', 'meeting', 2)).toBe(true); // the distance itself is 2…
    expect(classification('Mettng notes', { title: 'Meeting notes' })).toMatchObject({ cls: 'title', fuzzy: true });
    // …but a five-letter word may only be one edit away, so this is not a close match.
    expect(classification('metng', { title: 'Meeting' })).toBeNull();
    expect(classification('meetnig', { title: 'Meeting' })).toMatchObject({ fuzzy: true });
  });

  it('refuses three edits at any length', () => {
    expect(withinEdits('abcdefgh', 'abxyzfgh', 2)).toBe(false);
    expect(classification('Jxrxal', { title: 'Journal' })).toBeNull();
  });

  it('"Jornal" finds "Journal"', () => {
    expect(classification('Jornal', { title: 'Journal' })).toMatchObject({ cls: 'title', fuzzy: true });
  });

  it('counts a swap of two letters as a single edit', () => {
    expect(withinEdits('abcd', 'acbd', 1)).toBe(true);
    expect(withinEdits('abcdef', 'abdcef', 2)).toBe(true);
  });
});

describe('completeness and word order', () => {
  it('does not give a title a high place for matching one word of a longer query', () => {
    const complete = scoreOf('New note', { title: 'Other' }, 'we wrote new note today');
    const partialTitle = scoreOf('New note', { title: 'New' }, 'a note, not the phrase');

    expect(complete).toBeGreaterThan(partialTitle);
    expect(classification('New note', { title: 'New' }, 'nothing relevant')).toBeNull();
  });

  it('ranks the words in the order typed above the same words the other way round', () => {
    const inOrder = scoreOf('plan project', { title: 'Plan, then project' });
    const reversed = scoreOf('plan project', { title: 'Project, then plan' });

    expect(inOrder).toBeGreaterThan(reversed);
  });

  it('applies the same order preference to the body, and to close title matches', () => {
    expect(scoreOf('meeting agenda', { title: 'x' }, 'the meeting, then the agenda')).toBeGreaterThan(
      scoreOf('meeting agenda', { title: 'x' }, 'the agenda, then the meeting')
    );
    expect(scoreOf('Metting notes', { title: 'Meeting, notes' })).toBeGreaterThan(
      scoreOf('Metting notes', { title: 'Notes, meeting' })
    );
  });

  it('does not let repeating a phrase raise the score', () => {
    expect(scoreOf('new note', { title: 'x' }, 'new note')).toBe(scoreOf('new note', { title: 'x' }, 'new note, '.repeat(60)));
  });
});
