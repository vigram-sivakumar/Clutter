import { Item } from '../models';

export class VaultScanner {
  async scan(_vaultPath: string): Promise<Item[]> {
    return [];
  }
}
