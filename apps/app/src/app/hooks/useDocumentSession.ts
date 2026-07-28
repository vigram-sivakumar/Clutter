import { useEffect, useState } from 'react';
import { DocumentSession } from '@core/engine/DocumentSession';

/**
 * React adapter for DocumentSession.
 *
 * This hook observes session changes while keeping DocumentSession framework-agnostic.
 * React observes editing state rather than owning it.
 */
export function useDocumentSession(
  session: DocumentSession | undefined
): DocumentSession | undefined {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!session) return;

    const unsubscribe = session.subscribe(() => {
      setVersion((v) => v + 1);
    });

    return unsubscribe;
  }, [session]);

  return session;
}
