import type { CoinScore } from '../types';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export function buildPushMessage(pushToken: string, coin: CoinScore): PushMessage {
  return {
    to: pushToken,
    title: `Promising coin: ${coin.coinSymbol}`,
    body: `Score ${coin.score}/100 — ${coin.buyingTraderCount} top traders buying, ${coin.sellingTraderCount} selling.` +
      (coin.sampleTheses[0] ? ` "${coin.sampleTheses[0]}"` : ''),
    data: { coinSymbol: coin.coinSymbol, score: coin.score },
  };
}

/**
 * Sends messages via Expo's push notification service. `pushToken` is the
 * `ExponentPushToken[...]` string shown in the app after granting
 * notification permission (see App.tsx).
 */
export async function sendExpoPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Expo push send failed: ${res.status} ${res.statusText} ${body}`);
  }

  const json = (await res.json()) as { data?: Array<{ status: string; message?: string }> };
  const errors = (json.data ?? []).filter((d) => d.status !== 'ok');
  if (errors.length > 0) {
    throw new Error(`Expo push reported errors: ${JSON.stringify(errors)}`);
  }
}
