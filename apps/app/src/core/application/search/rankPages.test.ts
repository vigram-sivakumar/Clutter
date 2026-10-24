import { describe, expect, it } from 'vitest';
import { BodyText, parseQuery } from './matchPage';
import { foldString } from './foldText';
import { RankingJob, rankPages, type ScanCandidate } from './rankPages';

const DAY = 86_400_000;

function candidate(
  id: string,
  fields: {
    title?: string;
    aliases?: string[];
    headings?: string[];
    tags?: string[];
    body?: string;
    updatedMs?: number;
  }
): ScanCandidate {
  const title = fields.title ?? id;

  return {
    id,
    meta: {
      title: foldString(title),
      aliases: (fields.aliases ?? []).map(foldString),
      headings: (fields.headings ?? []).map(foldString),
      tags: (fields.tags ?? []).map((tag) => foldString(tag).replace(/[-_]+/g, ' ')),
    },
    body: new BodyText(fields.body ?? ''),
    updatedMs: fields.updatedMs ?? 0,
    sortTitle: foldString(title),
  };
}

const ids = (hits: { id: string }[]) => hits.map((hit) => hit.id);
const rank = (query: string, pages: ScanCandidate[], limit = 50) => rankPages(parseQuery(query)!, pages, limit);

describe('rankPages — ordering', () => {
  it('orders title, alias, tag, heading, then body phrase', () => {
    const hits = rank('design', [
      candidate('body', { body: 'a note about design' }),
      candidate('tag', { tags: ['design'] }),
      candidate('title', { title: 'Design' }),
      candidate('heading', { headings: ['Design'] }),
      candidate('alias', { aliases: ['design'] }),
    ]);

    expect(ids(hits)).toEqual(['title', 'alias', 'tag', 'heading', 'body']);
  });

  it('keeps the whole hierarchy for "new note": exact, prefix, word prefix, substring, close title, aliases, heading/body, nearby, weaker', () => {
    const hits = rank('new note', [
      candidate('weak-body', { body: `a new beginning ${'filler words '.repeat(30)} for this note` }),
      candidate('near-body', { body: 'a note about something new' }),
      candidate('phrase-body', { body: 'we wrote new note today' }),
      candidate('heading', { headings: ['New note'] }),
      candidate('tag', { tags: ['new note'] }),
      candidate('close-alias', { aliases: ['Naw note'] }),
      candidate('exact-alias', { aliases: ['New note'] }),
      candidate('close-title', { title: 'Nxw note' }),
      candidate('substring-title', { title: 'Renew notes' }),
      candidate('word-title', { title: 'My new notes' }),
      candidate('prefix-title', { title: 'New note ideas' }),
      candidate('exact-title', { title: 'New note' }),
    ]);

    expect(ids(hits)).toEqual([
      'exact-title',
      'prefix-title',
      'word-title',
      'substring-title',
      'close-title',
      'exact-alias',
      'close-alias',
      'tag',
      'heading',
      'phrase-body',
      'near-body',
      'weak-body',
    ]);
  });

  it('puts a page titled "New note" above a page whose body holds the exact phrase "Naw note"', () => {
    const hits = rank('Naw note', [
      candidate('body', { title: 'Other', body: 'this body has the exact phrase naw note in it' }),
      candidate('title', { title: 'New note' }),
    ]);

    expect(ids(hits)).toEqual(['title', 'body']);
    expect(hits.map((hit) => hit.fuzzy)).toEqual([true, false]);
  });

  it('puts every title match above an exact body phrase, even a weak title match against a fresh body', () => {
    const now = Date.now();
    const hits = rank('map road', [
      candidate('body', { title: 'Other', body: 'we saw a map road sign', updatedMs: now }),
      candidate('weak-title', { title: 'Roadmapping', updatedMs: now - 900 * DAY }),
    ]);

    expect(ids(hits)).toEqual(['weak-title', 'body']);
  });

  it('puts "New note" first for "New n" and finds no more than the notes that really match', () => {
    const noise = Array.from({ length: 300 }, (_, i) =>
      candidate(`noise-${i}`, { title: `Banana ${i}`, body: 'anana banana nonsense in an annual canon' })
    );
    const hits = rank('New n', [
      ...noise,
      candidate('paragraph', { title: 'Paragraph', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing' }),
      candidate('date', { title: 'Date mention', body: 'the rain will find an old letter beneath the window' }),
      candidate('note', { title: 'New note' }),
      candidate('later', { title: 'Brand new, nothing yet' }),
    ]);

    expect(hits[0]!.id).toBe('note');
    expect(ids(hits)).toEqual(['note', 'later']);
  });

  it('"New no" and "New note" favor New note and New notebook', () => {
    const pages = [
      candidate('renewal', { title: 'Renewal notice' }),
      candidate('notebook', { title: 'New notebook' }),
      candidate('note', { title: 'New note' }),
      candidate('banana', { title: 'New banana' }),
    ];

    expect(ids(rank('New no', pages)).slice(0, 2).sort()).toEqual(['note', 'notebook']);
    expect(ids(rank('New no', pages))).not.toContain('banana');
    expect(rank('New note', pages)[0]!.id).toBe('note');
  });

  it('puts an exact phrase in the body above the same words far apart', () => {
    const hits = rank('meeting agenda', [
      candidate('apart', { body: `a meeting ${'filler words '.repeat(40)} and an agenda` }),
      candidate('phrase', { body: 'here is the meeting agenda for today' }),
      candidate('near', { body: 'the agenda for the weekly meeting' }),
    ]);

    expect(ids(hits)).toEqual(['phrase', 'near', 'apart']);
  });

  it('does not let a word repeated a hundred times outrank a good title', () => {
    const hits = rank('meeting', [
      candidate('repeated', { body: 'meeting '.repeat(100) }),
      candidate('titled', { title: 'Meeting notes', body: 'nothing' }),
    ]);

    expect(ids(hits)).toEqual(['titled', 'repeated']);
  });

  it('lets recency break ties and only ties: a fresh weak match does not beat an older strong one', () => {
    const now = Date.now();
    const hits = rank('plan', [
      candidate('fresh-weak', { title: 'Replanning', updatedMs: now }),
      candidate('old-strong', { title: 'Plan', updatedMs: now - 700 * DAY }),
      candidate('fresh-strong', { title: 'Plan', updatedMs: now }),
    ]);

    expect(hits[0]!.id).toBe('fresh-strong');
    expect(ids(hits).indexOf('old-strong')).toBeLessThan(ids(hits).indexOf('fresh-weak'));
  });

  it('is deterministic and stable when scores tie: the same order for any input order', () => {
    const pages = ['delta', 'alpha', 'charlie', 'bravo', 'echo'].map((id) => candidate(id, { title: 'Same title' }));
    const forward = ids(rank('same title', pages));
    const backward = ids(rank('same title', [...pages].reverse()));
    const shuffled = ids(rank('same title', [pages[2]!, pages[4]!, pages[0]!, pages[3]!, pages[1]!]));

    expect(forward).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
    expect(backward).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });
});

describe('rankPages — close matches', () => {
  it('"Naw note", "Proejct plan" and "Metting notes" find their titles, flagged as close matches', () => {
    for (const [query, title] of [
      ['Naw note', 'New note'],
      ['Proejct plan', 'Project plan'],
      ['Metting notes', 'Meeting notes'],
    ] as const) {
      const hits = rank(query, [candidate('target', { title }), candidate('other', { title: 'Something else entirely' })]);

      expect(ids(hits), query).toEqual(['target']);
      expect(hits[0]!.fuzzy).toBe(true);
    }
  });

  it('an exact title outranks a close one, even a much more recently edited one', () => {
    const now = Date.now();
    const hits = rank('Project plan', [
      candidate('close', { title: 'Projekt plan', updatedMs: now }),
      candidate('exact', { title: 'Project plan', updatedMs: now - 900 * DAY }),
    ]);

    expect(ids(hits)).toEqual(['exact', 'close']);
    expect(hits.map((hit) => hit.fuzzy)).toEqual([false, true]);
  });

  it('a close title outranks an exact phrase in a body, even a fresher one', () => {
    const now = Date.now();
    const hits = rank('Proejct plan', [
      candidate('exact-body', { title: 'Other', body: 'we wrote proejct plan on purpose', updatedMs: now }),
      candidate('close-title', { title: 'Project plan', updatedMs: now - 900 * DAY }),
    ]);

    expect(ids(hits)).toEqual(['close-title', 'exact-body']);
  });

  it('produces no noisy close matches for short words', () => {
    const pages = ['Ab', 'Ac', 'Xy', 'Cat', 'Dog', 'Elk'].map((title) => candidate(title, { title }));

    expect(rank('aa', pages)).toEqual([]);
    expect(rank('x', pages).map((hit) => hit.id)).toEqual(['Xy']);
    expect(rank('xz', pages)).toEqual([]);
  });

  it('does not turn near-misses into a flood of results', () => {
    const titles = ['Meeting', 'Melting', 'Mating', 'Metering', 'Heating', 'Meeting notes', 'Menu', 'Medal', 'Medium'];
    const hits = rank('meeting', titles.map((title, i) => candidate(`t${i}`, { title })));

    // The exact titles, then the words up to two edits away (a seven-letter word allows two), in a fixed order.
    // "Heating" starts with another letter, and "Menu", "Medal" and "Medium" are further away: none of them is offered.
    expect(hits.map((hit) => titles[Number(hit.id.slice(1))])).toEqual([
      'Meeting',
      'Meeting notes',
      'Mating',
      'Melting',
      'Metering',
    ]);
    expect(hits.map((hit) => hit.fuzzy)).toEqual([false, false, true, true, true]);
  });

  it('requires every word: one close word cannot carry the query', () => {
    const pages = [candidate('p', { title: 'Project plan' })];

    expect(rank('Proejct banana', pages)).toEqual([]);
    expect(rank('Proejct plan banana', pages)).toEqual([]);
  });

  it('finds an alias by a typo and does not look in bodies for typos', () => {
    const hits = rank('Proejct', [
      candidate('alias', { title: 'Plans', aliases: ['Project'] }),
      candidate('body', { title: 'Notes', body: 'the project plan' }),
    ]);

    expect(ids(hits)).toEqual(['alias']);
  });

  it('keeps a page found by a close title when its body "match" turns out not to be real', () => {
    const hits = rank('Proejct', [
      candidate('page', { title: 'Project', body: '[link](https://proejct.example)' }),
      candidate('other', { title: 'Other' }),
    ]);

    expect(ids(hits)).toEqual(['page']);
  });
});

describe('rankPages — what counts as visible text', () => {
  it('drops a body candidate whose only match is syntax that is not visible text', () => {
    const hits = rank('secret', [
      candidate('url', { body: '[docs](https://secret.example)' }),
      candidate('real', { body: 'a secret note' }),
    ]);

    expect(ids(hits)).toEqual(['real']);
  });

  it('gives snippets for a title match whose body also mentions the query, best passage first', () => {
    const [hit] = rank('plan', [candidate('p', { title: 'Plan', body: 'intro\n\nthe plan is simple\n\nlater plan b' })]);

    expect(hit!.cls).toBe('title');
    expect(hit!.snippets.map((snippet) => snippet.text)).toEqual(['the plan is simple', 'later plan b']);
  });
});

describe('RankingJob — incremental ranking', () => {
  const many = (count: number, word = 'needle') =>
    Array.from({ length: count }, (_, i) =>
      candidate(`n${String(i).padStart(3, '0')}`, { body: `${word} ${i}`, updatedMs: Date.now() - i * DAY })
    );

  /** A clock that advances one tick per reading, so a budget of N ticks means N looks at the clock. */
  function tickingClock() {
    let time = 0;

    return () => time++;
  }

  it('gives the same hits in small steps as in one go', () => {
    const whole = rank('needle', many(120), 40);
    const job = new RankingJob(parseQuery('needle')!, many(120), 40, tickingClock());
    let steps = 0;

    while (!job.step(2)) {
      steps++;
      expect(steps).toBeLessThan(10_000);
    }

    expect(steps).toBeGreaterThan(5); // it really did work in pieces
    expect(ids(job.hits)).toEqual(ids(whole));
  });

  it('does not finish scoring in a step that runs out of budget', () => {
    const job = new RankingJob(parseQuery('needle')!, many(500), 10, tickingClock());

    expect(job.step(1)).toBe(false);
    expect(job.hits).toHaveLength(0);
  });

  it('extends from where it stopped: the next hits are the next in order, with no repeats and no rework', () => {
    const query = parseQuery('needle')!;
    const everything = ids(rankPages(query, many(60), 60));
    const pages = many(60);
    const job = new RankingJob(query, pages, 20);

    job.step(Number.POSITIVE_INFINITY);
    expect(ids(job.hits)).toEqual(everything.slice(0, 20));
    expect(job.hasMore).toBe(true);

    const parsedBefore = pages.filter((page) => (page.body as unknown as { built?: unknown }).built !== undefined).length;
    expect(parsedBefore).toBe(20);

    job.extend(20);
    expect(job.isComplete).toBe(false);
    job.step(Number.POSITIVE_INFINITY);
    expect(ids(job.hits)).toEqual(everything.slice(0, 40));

    job.extend(100);
    job.step(Number.POSITIVE_INFINITY);
    expect(ids(job.hits)).toEqual(everything);
    expect(new Set(ids(job.hits)).size).toBe(60);
    expect(job.hasMore).toBe(false);
    expect(job.isComplete).toBe(true);
  });

  it('skips candidates that turn out not to match when confirmed, and still fills the request', () => {
    const pages = [
      candidate('url-1', { body: '[a](https://needle.example)' }),
      candidate('real-1', { body: 'a needle' }),
      candidate('url-2', { body: '[b](https://needle.example/b)' }),
      candidate('real-2', { body: 'another needle here needle' }),
    ];
    const job = new RankingJob(parseQuery('needle')!, pages, 2);

    job.step(Number.POSITIVE_INFINITY);

    expect(ids(job.hits).sort()).toEqual(['real-1', 'real-2']);
  });

  it('reports no more once everything has been tried', () => {
    const job = new RankingJob(parseQuery('needle')!, many(3), 50);

    expect(job.step(Number.POSITIVE_INFINITY)).toBe(true);
    expect(job.hits).toHaveLength(3);
    expect(job.hasMore).toBe(false);
  });
});

describe('rankPages — the rules of the framework', () => {
  it('"New n": titles beginning with "New n" rank above pages with scattered "new" and "n"', () => {
    const hits = rank('New n', [
      candidate('scattered', { title: 'Other', body: 'new things, and later a number or two' }),
      candidate('scattered-title', { title: 'Brand new, a nap' }),
      candidate('begins-b', { title: 'New notebook' }),
      candidate('begins-a', { title: 'New note' }),
    ]);

    expect(ids(hits).slice(0, 2).sort()).toEqual(['begins-a', 'begins-b']);
    expect(ids(hits)).toContain('scattered');
  });

  it('a title with only "New" does not outrank a complete "New note" phrase in another page', () => {
    const hits = rank('New note', [
      candidate('partial-title', { title: 'New', body: 'a note, but not the phrase' }),
      candidate('phrase-body', { title: 'Other', body: 'remember to start a new note soon' }),
    ]);

    expect(ids(hits)).toEqual(['phrase-body', 'partial-title']);
  });

  it('a strong title does not lose to a body that merely repeats the query', () => {
    const hits = rank('new note', [
      candidate('body', { title: 'Other', body: 'new note, '.repeat(200) }),
      candidate('title', { title: 'My new notes', body: 'nothing' }),
    ]);

    expect(ids(hits)).toEqual(['title', 'body']);
  });

  it('a close title outranks an exact body phrase, and an exact title outranks both', () => {
    const hits = rank('New note', [
      candidate('exact-body', { title: 'Other', body: 'the exact phrase new note is here' }),
      candidate('close-title', { title: 'Nxw note' }),
      candidate('exact-title', { title: 'New note' }),
    ]);

    expect(ids(hits)).toEqual(['exact-title', 'close-title', 'exact-body']);
  });

  it('a query of one or two characters finds only titles — and never close ones', () => {
    const pages = [
      candidate('title', { title: 'Tea time' }),
      candidate('alias', { title: 'Other', aliases: ['tango'] }),
      candidate('tag', { title: 'Other', tags: ['tea'] }),
      candidate('body', { title: 'Other', body: 'a tidy tale, toast and tea' }),
      candidate('close', { title: 'Tx' }),
    ];

    expect(ids(rank('t', pages))).toEqual(['title', 'close']);
    expect(ids(rank('te', pages))).toEqual(['title']);
    expect(ids(rank('T e', pages))).toEqual([]);
    expect(parseQuery('   ')).toBeNull();
  });

  it('a query of three characters reaches every field', () => {
    const hits = rank('tea', [
      candidate('title', { title: 'Tea time' }),
      candidate('alias', { title: 'Other', aliases: ['teacher'] }),
      candidate('tag', { title: 'Other', tags: ['tea'] }),
      candidate('body', { title: 'Other', body: 'a cup of tea, please' }),
    ]);

    expect(ids(hits)).toEqual(['title', 'alias', 'tag', 'body']);
  });

  it('is deterministic: the same ranking for the same input, whatever its order', () => {
    const pages = Array.from({ length: 30 }, (_, i) =>
      candidate(`p${i}`, { title: i % 3 === 0 ? 'New note' : i % 3 === 1 ? 'Nxw note' : 'Other', body: i % 2 ? 'new note' : 'note new' })
    );
    const forward = ids(rank('New note', pages));

    expect(ids(rank('New note', [...pages].reverse()))).toEqual(forward);
    expect(ids(rank('New note', [...pages].sort(() => 0.5 - Math.sin(pages.length))))).toEqual(forward);
  });
});
