import { IdGenerator } from './IdGenerator';

export class UuidGenerator implements IdGenerator {
  public generate(): string {
    return crypto.randomUUID();
  }
}
