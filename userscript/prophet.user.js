// ==UserScript==
// @name         Prophet — Fomo trader signal notifier
// @namespace    https://github.com/johnfletchersnodgrass/prophet
// @version      0.2.0
// @description  Watches traders you follow on Fomo and pushes a notification when their buys/sells add up to a promising coin.
// @match        https://fomo.family/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      exp.host
// ==/UserScript==

/**
 * WHY THIS IS A USERSCRIPT AND NOT A SERVER CRON JOB
 * ----------------------------------------------------
 * fomo.family's API (prod-api.fomo.family) sits behind Cloudflare bot
 * management. Scripted requests get rejected with {"authorized": false}
 * even with a fresh, valid, unexpired auth token — Cloudflare fingerprints
 * the client as non-browser and blocks it before the token is even
 * checked. Running this *inside* your actual logged-in browser tab sidesteps
 * that entirely: the fetch calls below are indistinguishable from normal
 * page activity because they are normal page activity — same cookies, same
 * TLS session, same fingerprint as you browsing the site.
 *
 * The trade-off: this only runs while you have a fomo.family tab open in
 * the browser where it's installed. See ../README.md for install steps.
 *
 * WHAT THE REAL DATA LOOKS LIKE (confirmed from a live response)
 * ----------------------------------------------------------------
 * GET /v2/users/<id>/swaps returns:
 *   { success, message, responseObject: { swaps: [...], hasNextPage }, statusCode }
 * Each swap is a token-for-token exchange, not a labeled "buy"/"sell":
 *   { inTokenAddress, inNetworkId, humanUsdAmountIn,
 *     outTokenAddress, outNetworkId, humanUsdAmountOut, createdAt, ... }
 * There is no thesis/notes/commentary field anywhere in this payload — Fomo's
 * swap history is pure on-chain trade data, so this script scores on trade
 * flow only. (If you find a real notes/thesis feature elsewhere in the app,
 * it'd need its own endpoint wired in separately.)
 * There's also no token symbol/name in this payload, only contract
 * addresses — notifications show a shortened address until a token-metadata
 * endpoint is found and wired into `describeToken()` below.
 * Only the first page of swaps is fetched (no pagination wired up yet —
 * `hasNextPage` is logged so you can tell if you're missing history).
 */

(function () {
  'use strict';

  // ---- Configure me -------------------------------------------------
  const CONFIG = {
    // Handles of the traders you follow / want to watch. The script
    // resolves each to a user id itself (via /v2/users/userHandle/<handle>).
    followedHandles: ['lordlightning'],

    // Expo push token(s) from the Prophet app (App.tsx shows it after you
    // grant notification permission). Comma-separate multiple devices.
    expoPushTokens: [],

    pollIntervalMinutes: 5,
    lookbackHours: 24,
    scoreThreshold: 70,
    cooldownHours: 12,
    reNotifyScoreDelta: 10,
  };
  // ---------------------------------------------------------------------

  // Solana mainnet USDC mint — every swap seen so far settles through this,
  // on either the in or out leg. Used to tell buy legs from sell legs.
  const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  const STATE_KEY = 'prophet:notified';
  const ID_CACHE_KEY = 'prophet:handleToId';

  function log(...args) {
    console.log('[prophet]', ...args);
  }
  function warn(...args) {
    console.warn('[prophet]', ...args);
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function apiGet(path) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`GET ${path} -> ${res.status}`);
    }
    return res.json();
  }

  /** Fomo wraps responses as {success, responseObject, statusCode, ...}. */
  function unwrap(raw) {
    return raw && typeof raw === 'object' && 'responseObject' in raw ? raw.responseObject : raw;
  }

  async function resolveHandleToId(handle) {
    const cache = loadJson(ID_CACHE_KEY, {});
    if (cache[handle]) return cache[handle];

    const data = unwrap(await apiGet(`/v2/users/userHandle/${encodeURIComponent(handle)}`));
    const id = data?.id ?? data?.userId ?? data?.uuid;
    if (!id) {
      warn(`could not find an id field for handle "${handle}" — raw response:`, data);
      throw new Error(`Unrecognized profile response shape for ${handle}`);
    }
    cache[handle] = id;
    saveJson(ID_CACHE_KEY, cache);
    return id;
  }

  function coinKey(networkId, address) {
    return `${networkId}:${address}`;
  }

  function describeToken(networkId, address) {
    return `${address.slice(0, 4)}…${address.slice(-4)} (chain ${networkId})`;
  }

  /**
   * Splits one swap into up to two "legs": a sell of whatever non-USDC asset
   * went in, and a buy of whatever non-USDC asset came out. Handles the
   * common USDC<->token case (one leg) and direct token<->token swaps (two
   * legs) the same way.
   */
  function swapToLegs(raw) {
    const legs = [];
    const usd = (v) => Number(v) || 0;

    if (raw.inTokenAddress && raw.inTokenAddress !== USDC_SOL) {
      legs.push({
        side: 'sell',
        key: coinKey(raw.inNetworkId, raw.inTokenAddress),
        networkId: raw.inNetworkId,
        address: raw.inTokenAddress,
        sizeUsd: usd(raw.humanUsdAmountIn),
        timestamp: raw.createdAt,
      });
    }
    if (raw.outTokenAddress && raw.outTokenAddress !== USDC_SOL) {
      legs.push({
        side: 'buy',
        key: coinKey(raw.outNetworkId, raw.outTokenAddress),
        networkId: raw.outNetworkId,
        address: raw.outTokenAddress,
        sizeUsd: usd(raw.humanUsdAmountOut),
        timestamp: raw.createdAt,
      });
    }
    return legs;
  }

  function traderWeight(rank) {
    return 1 / Math.sqrt(rank);
  }

  function scoreCoins(traderLegs) {
    // traderLegs: Array<{ rank: number, legs: Leg[] }>
    const coins = new Map();
    let totalWeightedVolume = 0;

    for (const { rank, legs } of traderLegs) {
      const weight = traderWeight(rank);

      for (const leg of legs) {
        let acc = coins.get(leg.key);
        if (!acc) {
          acc = {
            key: leg.key,
            networkId: leg.networkId,
            address: leg.address,
            buyUsdWeighted: 0,
            sellUsdWeighted: 0,
            buyCount: 0,
            sellCount: 0,
          };
          coins.set(leg.key, acc);
        }
        const weighted = leg.sizeUsd * weight;
        totalWeightedVolume += weighted;
        if (leg.side === 'buy') {
          acc.buyUsdWeighted += weighted;
          acc.buyCount += 1;
        } else {
          acc.sellUsdWeighted += weighted;
          acc.sellCount += 1;
        }
      }
    }

    const results = [];
    for (const acc of coins.values()) {
      const net = acc.buyUsdWeighted - acc.sellUsdWeighted;
      const signal = totalWeightedVolume > 0 ? Math.max(-1, Math.min(1, net / totalWeightedVolume)) : 0;
      const score = Math.round(((signal + 1) / 2) * 100);
      results.push({
        key: acc.key,
        label: describeToken(acc.networkId, acc.address),
        score,
        buyCount: acc.buyCount,
        sellCount: acc.sellCount,
      });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  function shouldNotify(coin, state, now) {
    if (coin.score < CONFIG.scoreThreshold) return false;
    const last = state[coin.key];
    if (!last) return true;
    const hoursSince = (now - last.notifiedAt) / (60 * 60 * 1000);
    if (hoursSince >= CONFIG.cooldownHours) return true;
    if (coin.score - last.score >= CONFIG.reNotifyScoreDelta) return true;
    return false;
  }

  function gmPost(url, body) {
    // Uses GM_xmlhttpRequest (not page fetch) so this cross-origin call to
    // exp.host isn't subject to the page's CORS policy — fomo.family never
    // declared exp.host as an allowed cross-origin target, so a plain
    // `fetch()` here would silently fail even though the request itself is
    // fine. Requires @grant GM_xmlhttpRequest + @connect exp.host above.
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        data: JSON.stringify(body),
        onload: (res) => resolve(res),
        onerror: (err) => reject(err),
      });
    });
  }

  async function sendExpoPush(coin) {
    if (CONFIG.expoPushTokens.length === 0) return;
    const messages = CONFIG.expoPushTokens.map((to) => ({
      to,
      title: `Promising coin: ${coin.label}`,
      body: `Score ${coin.score}/100 — ${coin.buyCount} buy swaps, ${coin.sellCount} sell swaps in the lookback window.`,
      data: { coinKey: coin.key, score: coin.score },
    }));
    try {
      const res = await gmPost('https://exp.host/--/api/v2/push/send', messages);
      if (res.status >= 400) {
        warn('Expo push returned an error status', res.status, res.responseText);
      }
    } catch (err) {
      warn('Expo push failed', err);
    }
  }

  function notifyBrowser(coin) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(`Promising coin: ${coin.label}`, {
        body: `Score ${coin.score}/100 — ${coin.buyCount} buys, ${coin.sellCount} sells.`,
      });
    }
  }

  async function fetchTraderLegs(handle, rank) {
    const id = await resolveHandleToId(handle);
    const since = Date.now() - CONFIG.lookbackHours * 60 * 60 * 1000;
    const data = unwrap(await apiGet(`/v2/users/${id}/swaps`));
    const swaps = Array.isArray(data?.swaps) ? data.swaps : [];
    if (data?.hasNextPage) {
      log(
        `${handle}: more swap history exists beyond the first page (pagination not wired up yet) —`,
        'scoring may miss older trades still inside the lookback window.',
      );
    }

    const legs = swaps
      .filter((s) => !s.createdAt || new Date(s.createdAt).getTime() >= since)
      .flatMap(swapToLegs);
    return { rank, legs };
  }

  async function tick() {
    try {
      const traderLegs = await Promise.all(
        CONFIG.followedHandles.map((handle, i) => fetchTraderLegs(handle, i + 1)),
      );
      const scored = scoreCoins(traderLegs);
      log(
        'scored',
        scored.length,
        'coins. top:',
        scored.slice(0, 5).map((c) => `${c.label}=${c.score}`).join(', '),
      );

      const state = loadJson(STATE_KEY, {});
      const now = Date.now();
      const toNotify = scored.filter((c) => shouldNotify(c, state, now));

      for (const coin of toNotify) {
        await sendExpoPush(coin);
        notifyBrowser(coin);
        state[coin.key] = { score: coin.score, notifiedAt: now };
        log('notified on', coin.label, 'score', coin.score);
      }
      if (toNotify.length > 0) saveJson(STATE_KEY, state);

      updateStatusWidget(scored, toNotify);
    } catch (err) {
      warn('tick failed', err);
    }
  }

  // ---- tiny on-page status widget so you can see it's alive -----------
  let widgetEl;
  function ensureWidget() {
    if (widgetEl) return widgetEl;
    widgetEl = document.createElement('div');
    widgetEl.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:999999;background:#1A1817;color:#fff;' +
      'font:12px monospace;padding:8px 10px;border-radius:8px;opacity:0.85;max-width:280px;';
    document.body.appendChild(widgetEl);
    return widgetEl;
  }
  function updateStatusWidget(scored, notified) {
    const el = ensureWidget();
    const top = scored.slice(0, 3).map((c) => `${c.label} ${c.score}`).join(' · ') || 'no data yet';
    el.textContent = `prophet — ${new Date().toLocaleTimeString()} — ${top}${
      notified.length ? ` — notified: ${notified.map((c) => c.label).join(',')}` : ''
    }`;
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  tick();
  setInterval(tick, CONFIG.pollIntervalMinutes * 60 * 1000);
})();
