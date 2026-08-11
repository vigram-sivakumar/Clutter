import type { IdGenerator } from '../../shared/identity/IdGenerator';

/** Deterministic, collision-free ids for tests: generated-1, generated-2, ... */
export class FakeIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `generated-${this.counter}`;
  }
}
