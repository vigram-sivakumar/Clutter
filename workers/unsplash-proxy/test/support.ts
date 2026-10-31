import { vi } from 'vitest';

import { handle, type Env } from '../src/index';

/** A stand-in key. It must never appear in a response, a log line or anything but the upstream Authorization header. */
export const SECRET = 'test-ONLY-access-key-9f8e7d6c5b4a';
export const ORIGIN = 'tauri://localhost';

export const ENV: Env = {
  UNSPLASH_ACCESS_KEY: SECRET,
  ALLOWED_ORIGINS: 'tauri://localhost,http://localhost:1421',
};

/** A realistic Unsplash photo, with the extra fields the real API returns and the proxy must not pass on. */
export function rawPhoto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'LBI7cgq3pbM',
    created_at: '2020-01-01T00:00:00Z',
    width: 5000,
    height: 3333,
    likes: 1234,
    sponsorship: { sponsor: { name: 'Someone' } },
    urls: {
      raw: 'https://images.unsplash.com/photo-1?ixid=IX1',
      full: 'https://images.unsplash.com/photo-1?ixid=IX1&q=85',
      regular: 'https://images.unsplash.com/photo-1?ixlib=rb-4.0.3&ixid=IX1&w=1080&q=80',
      small: 'https://images.unsplash.com/photo-1?ixlib=rb-4.0.3&ixid=IX1&w=400&q=80',
      thumb: 'https://images.unsplash.com/photo-1?ixid=IX1&w=200',
    },
    user: {
      id: 'u1',
      username: 'alex',
      name: 'Alex Doe',
      links: { html: 'https://unsplash.com/@alex', self: 'https://api.unsplash.com/users/alex' },
    },
    links: {
      html: 'https://unsplash.com/photos/LBI7cgq3pbM',
      download: 'https://unsplash.com/photos/LBI7cgq3pbM/download',
      download_location: 'https://api.unsplash.com/photos/LBI7cgq3pbM/download?ixid=MnwxMjA3fDB8MXxzZWFyY2h8',
    },
    ...overrides,
  };
}

export interface Call {
  readonly url: URL;
  readonly init: RequestInit;
}

/** A fake upstream: records every call, answers with `reply`. */
export function upstream(reply: () => Response | Promise<Response> = () => json({ results: [rawPhoto()] })) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (input: string, init: RequestInit) => {
    calls.push({ url: new URL(input), init });

    return reply();
  });

  return { calls, fetcher };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://proxy.example.test${path}`, init);
}

export async function call(
  path: string,
  options: { init?: RequestInit; env?: Partial<Env> | Env; reply?: () => Response | Promise<Response> } = {}
) {
  const fake = upstream(options.reply);
  const response = await handle(request(path, options.init), { ...ENV, ...options.env }, fake.fetcher);

  return { response, calls: fake.calls, fetcher: fake.fetcher };
}

/** The whole response as one string: body and every header, for checks that something never appears in it. */
export async function everything(response: Response): Promise<string> {
  const headers = [...response.headers].map(([name, value]) => `${name}: ${value}`).join('\n');

  return `${headers}\n${await response.clone().text()}`;
}
