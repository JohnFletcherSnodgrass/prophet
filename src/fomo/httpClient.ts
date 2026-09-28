import type { FomoClient, Trader, TraderActivity } from '../types';
import { extractEmbeddedJson } from './htmlJson';

export interface HttpFomoClientConfig {
  /** e.g. https://fomo.family */
  baseUrl: string;
  /**
   * If the leaderboard/trade history requires a logged-in session, paste the
   * `cookie` header value from a logged-in browser session here. Treat this
   * as a secret (GitHub Actions secret, never committed).
   */
  sessionCookie?: string;
}

/**
 * Real Fomo integration — UNVERIFIED SCAFFOLD.
 *
 * This session's network access to fomo.family was blocked, so the actual
 * page/API structure has not been inspected yet. This client is written to
 * fail loudly and specifically rather than silently return wrong data:
 *
 *   1. It fetches the leaderboard/profile HTML.
 *   2. It tries generic embedded-JSON extraction (Next.js/Nuxt patterns).
 *   3. If that doesn't find recognizable trader/trade/thesis data, it throws
 *      with a message pointing at what to fix.
 *
 * TODO once fomo.family is reachable (widen network access, then re-run):
 *   - Confirm the leaderboard URL/endpoint that lists top traders.
 *   - Confirm whether trade history + thesis text are public on a profile
 *     page (e.g. https://fomo.family/profile/<handle>) or need auth.
 *   - Replace `parseTradersFromHtml` / `parseActivityFromHtml` below with
 *     real field mappings once the JSON shape (or a documented API) is known.
 */
export function createHttpFomoClient(config: HttpFomoClientConfig): FomoClient {
  const headers: Record<string, string> = {
    accept: 'text/html,application/json',
    'user-agent': 'prophet-bot/1.0 (+https://github.com/johnfletchersnodgrass/prophet)',
  };
  if (config.sessionCookie) {
    headers.cookie = config.sessionCookie;
  }

  async function fetchHtml(path: string): Promise<string> {
    const url = new URL(path, config.baseUrl).toString();
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Fomo request failed: GET ${url} -> ${res.status} ${res.statusText}`);
    }
    return res.text();
  }

  return {
    async fetchTopTraders(limit: number): Promise<Trader[]> {
      const html = await fetchHtml('/leaderboard');
      const blobs = extractEmbeddedJson(html);
      const traders = parseTradersFromHtml(blobs, limit);
      if (traders.length === 0) {
        throw new Error(
          'Could not parse top traders from fomo.family/leaderboard. The page ' +
            "structure hasn't been confirmed yet — inspect the HTML/JSON and " +
            'update parseTradersFromHtml() in src/fomo/httpClient.ts.',
        );
      }
      return traders;
    },

    async fetchTraderActivity(trader: Trader, sinceIso: string): Promise<TraderActivity> {
      const html = await fetchHtml(`/profile/${trader.handle}`);
      const blobs = extractEmbeddedJson(html);
      const activity = parseActivityFromHtml(trader, blobs, sinceIso);
      if (!activity) {
        throw new Error(
          `Could not parse trade/thesis data for trader "${trader.handle}" from ` +
            `fomo.family/profile/${trader.handle}. Update parseActivityFromHtml() ` +
            'in src/fomo/httpClient.ts once the real data shape is known.',
        );
      }
      return activity;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseTradersFromHtml(_blobs: unknown[], _limit: number): Trader[] {
  // TODO: implement once fomo.family's leaderboard JSON shape is confirmed.
  return [];
}

function parseActivityFromHtml(
  _trader: Trader,
  _blobs: unknown[],
  _sinceIso: string,
): TraderActivity | null {
  // TODO: implement once fomo.family's profile JSON shape is confirmed.
  return null;
}
