/** One runtime transaction/uncertain-COMMIT primitive for I1 and proof controls. */
export interface SqlConnection {
  exec(sql: string): unknown;
  readonly isTransaction: boolean;
}
export class CommitUnknown extends Error {
  readonly rollbackFailed: boolean;
  constructor(cause: unknown, rollbackFailed: boolean) {
    super('OUTCOME_UNKNOWN', { cause });
    this.rollbackFailed = rollbackFailed;
  }
}
export async function atomic<T>(
  db: SqlConnection,
  write: () => Promise<T> | T,
  afterCommit?: () => Promise<void> | void
): Promise<T> {
  let attempted = false;
  try {
    db.exec('BEGIN EXCLUSIVE');
    const value = await write();
    attempted = true;
    db.exec('COMMIT');
    await afterCommit?.();
    return value;
  } catch (e) {
    let failed = false;
    try {
      if (db.isTransaction) db.exec('ROLLBACK');
    } catch {
      failed = true;
    }
    if (attempted || failed) throw new CommitUnknown(e, failed);
    throw e;
  }
}
