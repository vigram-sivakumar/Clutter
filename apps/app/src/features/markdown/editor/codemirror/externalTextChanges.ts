import type { ChangeSpec } from '@codemirror/state';

/** A bounded Myers diff in UTF-16 document coordinates. No history or editor state is owned here. */
export function externalTextChanges(
  before: string,
  after: string
): {
  changes: ChangeSpec[];
  precise: boolean;
} {
  let prefix = 0;
  const common = Math.min(before.length, after.length);
  while (prefix < common && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < common - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  const a = before.slice(prefix, before.length - suffix);
  const b = after.slice(prefix, after.length - suffix);
  if (!a.length || !b.length) {
    return {
      changes:
        a === b ? [] : [{ from: prefix, to: prefix + a.length, insert: b }],
      precise: true,
    };
  }

  // Sparse edits in large notes stay cheap. Unrelated wholesale documents cannot consume quadratic time/memory.
  // If this budget is exhausted, the caller MUST discard history before applying the conservative replacement.
  const distance = Math.min(a.length + b.length, 512);
  const offset = distance + 1;
  const frontier = new Int32Array(2 * distance + 3).fill(-1);
  frontier[offset + 1] = 0;
  const trace: Int32Array[] = [];
  let work = 0;
  for (let d = 0; d <= distance; d++) {
    trace.push(frontier.slice());
    for (let k = -d; k <= d; k += 2) {
      if (++work > 1_000_000) return fallback();
      const index = offset + k;
      let x =
        k === -d || (k !== d && frontier[index - 1]! < frontier[index + 1]!)
          ? frontier[index + 1]!
          : frontier[index - 1]! + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        if (++work > 1_000_000) return fallback();
        x++;
        y++;
      }
      frontier[index] = x;
      if (x >= a.length && y >= b.length)
        return {
          changes: backtrack(trace, offset, a, b, prefix),
          precise: true,
        };
    }
  }
  return fallback();

  function fallback() {
    return {
      changes: [{ from: prefix, to: prefix + a.length, insert: b }],
      precise: false,
    };
  }
}

function backtrack(
  trace: Int32Array[],
  offset: number,
  a: string,
  b: string,
  prefix: number
): ChangeSpec[] {
  // 0 = unchanged, 1 = deletion, 2 = insertion. Trace is bounded by the edit-distance limit above.
  const steps: number[] = [];
  let x = a.length,
    y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const previousK =
      k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
        ? k + 1
        : k - 1;
    const previousX = v[offset + previousK]!;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      steps.push(0);
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === previousX) {
      steps.push(2);
      y--;
    } else {
      steps.push(1);
      x--;
    }
  }
  steps.reverse();
  const changes: ChangeSpec[] = [];
  let from = -1,
    startB = 0;
  x = 0;
  y = 0;
  const flush = () => {
    if (from !== -1)
      changes.push({
        from: prefix + from,
        to: prefix + x,
        insert: b.slice(startB, y),
      });
    from = -1;
  };
  for (const step of steps) {
    if (step === 0) {
      flush();
      x++;
      y++;
    } else {
      if (from === -1) {
        from = x;
        startB = y;
      }
      if (step === 1) x++;
      else y++;
    }
  }
  flush();
  return changes;
}
