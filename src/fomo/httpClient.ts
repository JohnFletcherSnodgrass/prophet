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
 * Real Fomo integration — DEAD END, kept for reference only.
 *
 * fomo.family isn't a server-rendered HTML site with embedded JSON (the
 * assumption this file was written against) — it's a SPA calling a JSON API
 * at prod-api.fomo.family. Worse: that API sits behind Cloudflare bot
 * management. Scripted requests (curl, this client, a GitHub Actions runner)
 * get rejected with `{"authorized": false}` even with a fresh, valid,
 * unexpired bearer token — Cloudflare fingerprints the client as non-browser
 * and blocks it before the token is checked at all. Confirmed by testing:
 * the exact headers/cookies/token copied from a working logged-in browser
 * request still fail when replayed from a script, and Cloudflare mints a
 * brand new __cf_bm cookie on every attempt instead of accepting the one
 * supplied — a clear bot-fingerprinting signature, not an auth problem.
 *
 * Building something to spoof a browser fingerprint and get past that
 * wasn't the right call — it's specifically the protection the site put up
 * against this kind of automation. Instead, the real integration lives in
 * ../../userscript/prophet.user.js: it runs *inside* your actual logged-in
 * browser tab, so requests are indistinguishable from normal browsing
 * (because they are normal browsing) and Cloudflare never flags them.
 *
 * This HTML-scraping client is left in place only in case fomo.family adds
 * a server-rendered page some scheduled job could read without hitting the
 * protected API.
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
