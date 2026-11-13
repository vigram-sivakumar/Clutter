import { useEffect, useState } from 'react';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

/** Refresh date-dependent UI at local midnight, and catch up after sleep, focus or visibility changes. */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => toISODate(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setDay(toISODate(now));
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(refresh, next.getTime() - now.getTime() + 1);
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return day;
}
