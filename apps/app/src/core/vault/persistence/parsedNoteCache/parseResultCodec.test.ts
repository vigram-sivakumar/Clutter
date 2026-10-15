import { describe, expect, it } from 'vitest';
import { FrontmatterParser } from '../../ingest/FrontmatterParser';
import {
  encodeParts,
  restoreUndefined,
  structurallyIdentical,
} from './parseResultCodec';
import { GOLDEN_SAMPLES } from './parseCorpus';

const parser = new FrontmatterParser();

function roundTrip(value: unknown): unknown {
  const encoded = encodeParts(value);
  if (!encoded) throw new Error('not encodable');
  return restoreUndefined(JSON.parse(encoded.text));
}

describe('parse result codec', () => {
  it('preserves present-with-undefined optional keys that plain JSON drops', () => {
    const value = {
      task: { text: 'x', dueDate: undefined, completedAt: undefined },
    };
    const back = roundTrip(value) as typeof value;

    expect(Object.keys(back.task)).toEqual(['text', 'dueDate', 'completedAt']);
    expect('dueDate' in back.task).toBe(true);
    expect(back).toStrictEqual(value);
  });

  it('canary: a naive JSON round trip is NOT strictly identical — the comparison would catch the regression', () => {
    const value = { task: { text: 'x', dueDate: undefined } };
    const naive = JSON.parse(JSON.stringify(value));

    expect(structurallyIdentical(value, naive)).toBe(false);
    expect(() => expect(naive).toStrictEqual(value)).toThrow();
  });

  it('round-trips every real parse result in the corpus exactly', () => {
    for (const [name, text] of Object.entries(GOLDEN_SAMPLES)) {
      const { body: _body, ...parts } = parser.parse(text);
      const encoded = encodeParts(parts);
      expect(encoded, `sample "${name}" must be cacheable`).not.toBeNull();
      expect(restoreUndefined(JSON.parse(encoded!.text)), name).toStrictEqual(
        parts
      );
    }
  });

  it('builds new objects on every restore, never sharing state between hits', () => {
    const encoded = encodeParts({
      list: [{ a: 1 }],
      nested: { b: undefined },
    })!;
    const first = restoreUndefined(encoded.raw) as {
      list: Array<{ a: number }>;
    };
    const second = restoreUndefined(encoded.raw) as {
      list: Array<{ a: number }>;
    };

    expect(first).not.toBe(second);
    expect(first.list[0]).not.toBe(second.list[0]);
    first.list[0]!.a = 99;
    expect(second.list[0]!.a).toBe(1);
  });

  it('keeps arrays, empty containers, unicode, nulls and special keys exact', () => {
    const value = JSON.parse(
      '{"__proto__":{"polluted":1},"empty":[],"emptyObject":{},"nul":null,"text":"日本語 😀 \\u0000","n":-1.5,"list":[[],[{}]]}'
    );
    // JSON.parse gives "__proto__" as an own key, as the parser's keys could be.
    expect(roundTrip(value)).toStrictEqual(value);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses what it cannot reproduce exactly, so the entry is simply not cached', () => {
    const refused: Array<[string, unknown]> = [
      ['NaN', { n: Number.NaN }],
      ['Infinity', { n: Number.POSITIVE_INFINITY }],
      ['negative zero', { n: -0 }],
      ['Date', { d: new Date(0) }],
      ['Map', { m: new Map([[1, 2]]) }],
      ['Set', { s: new Set([1]) }],
      ['sparse array', { a: [1, , 3] }], // eslint-disable-line no-sparse-arrays
      [
        'class instance',
        {
          c: new (class Thing {
            x = 1;
          })(),
        },
      ],
      ['function', { f: () => 1 }],
      ['symbol key', { [Symbol('k')]: 1 }],
      ['BigInt', { b: 1n }],
      ['marker collision', { v: { $undef: true } }],
      [
        'accessor property',
        Object.defineProperty({}, 'g', { get: () => 1, enumerable: true }),
      ],
    ];
    for (const [name, value] of refused) {
      expect(encodeParts(value), name).toBeNull();
    }
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(encodeParts(cycle)).toBeNull();
  });

  it('structural identity distinguishes key presence, order-independent, prototypes and array length', () => {
    expect(structurallyIdentical({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(structurallyIdentical({ a: undefined }, {})).toBe(false);
    expect(structurallyIdentical([1], [1, undefined])).toBe(false);
    expect(structurallyIdentical({}, Object.create({ inherited: 1 }))).toBe(
      false
    );
    expect(structurallyIdentical({ a: -0 }, { a: 0 })).toBe(false);
    expect(structurallyIdentical({ a: Number.NaN }, { a: Number.NaN })).toBe(
      true
    );
  });

  it('fuzz: random nested values with undefined, null, empties and unicode round-trip exactly or are refused', () => {
    let seed = 12345;
    const random = () =>
      (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const keys = ['a', 'b', 'tags', '日本', '$undef', '__proto__', 'x y', ''];
    const make = (depth: number): unknown => {
      const r = random();
      if (depth > 3 || r < 0.25) {
        return [undefined, null, 0, 1, 'text', '', true, false, '😀', 'é'][
          Math.floor(random() * 10)
        ];
      }
      if (r < 0.55)
        return Array.from({ length: Math.floor(random() * 4) }, () =>
          make(depth + 1)
        );
      const out: Record<string, unknown> = {};
      for (let i = 0; i < Math.floor(random() * 5); i += 1) {
        Object.defineProperty(out, keys[Math.floor(random() * keys.length)]!, {
          value: make(depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return out;
    };
    let encodable = 0;
    for (let i = 0; i < 2000; i += 1) {
      const value = { entry: make(0) };
      const encoded = encodeParts(value);
      if (encoded) {
        encodable += 1;
        expect(restoreUndefined(JSON.parse(encoded.text))).toStrictEqual(value);
      }
    }
    expect(encodable).toBeGreaterThan(500); // the fuzz exercised real round trips, not only refusals
  });
});
