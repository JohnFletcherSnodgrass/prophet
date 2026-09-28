import type { FomoClient } from '../types';
import { createMockFomoClient } from './mockClient';
import { createHttpFomoClient } from './httpClient';

/**
 * Picks the real Fomo client when FOMO_BASE_URL is set, otherwise falls back
 * to deterministic mock data. This keeps `npm run poll` runnable end-to-end
 * (and testable in CI) before the real integration is wired up.
 */
export function createFomoClientFromEnv(env: NodeJS.ProcessEnv = process.env): FomoClient {
  if (env.FOMO_BASE_URL) {
    return createHttpFomoClient({
      baseUrl: env.FOMO_BASE_URL,
      sessionCookie: env.FOMO_SESSION_COOKIE,
    });
  }
  return createMockFomoClient();
}

export type { FomoClient } from '../types';
export { createMockFomoClient } from './mockClient';
export { createHttpFomoClient } from './httpClient';
