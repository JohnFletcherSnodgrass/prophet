# Prophet

Watches the traders you follow on [Fomo](https://fomo.family), aggregates
their buys and sells into a per-coin "promise score," and sends you a push
notification when a coin looks worth a look.

## Two integration paths — read this first

There are **two** ways this repo can get real Fomo data, and only one of
them actually works against the live site:

- **`userscript/prophet.user.js` (this is the real one)** — runs inside your
  actual logged-in browser tab on fomo.family. See "Real-time setup" below.
- **`src/fomo/httpClient.ts` + the GitHub Actions cron job** — a server-side
  approach that was tried first and **does not work**: fomo.family's API is
  behind Cloudflare bot management, which rejects scripted requests even
  with a valid, unexpired auth token (confirmed by testing — see the comment
  at the top of `httpClient.ts` for the full story). It's kept in the repo,
  running against mock data, as a demonstration of the scoring pipeline and
  in case that changes later.

## How it works

```
userscript/prophet.user.js   The real integration — see "Real-time setup" below
src/fomo/        Pluggable Fomo data source (mock client; httpClient.ts is a documented dead end)
src/scoring/     Aggregates trades + thesis sentiment into a 0-100 score per coin
src/notify/      Sends the alert via Expo's push notification service
src/state/       Tracks which coins were already notified on, so you don't get spammed
src/pipeline.ts  Wires the above together: fetch -> score -> filter -> notify -> persist
scripts/poll-and-notify.ts   CLI entry point for the (non-working-against-real-data) cron path
.github/workflows/poll.yml   Runs scripts/poll-and-notify.ts every 15 minutes, against mock data
App.tsx          Minimal Expo app: grants notification permission, shows your push token
```

### Scoring

For each coin, across the traders you're tracking:

- Each trader is weighted by rank/position in your list (`1/sqrt(rank)`), so
  whoever you list first counts for more than whoever's last.
- Buys add weight, sells subtract it → a trade signal in `[-1, 1]`, mapped to
  `0-100`.
- The Node pipeline (`src/scoring/`) additionally factors in thesis-text
  sentiment via a bullish/bearish keyword lexicon
  (`src/scoring/keywords.ts`); the userscript's ported version currently
  scores on trades only, since no thesis/notes field has been confirmed in
  Fomo's data yet (see `FIELD_CANDIDATES` in the userscript — add one there
  if you find it).

This is a heuristic, not investment advice — tune the weights and keyword
lists to match how you actually want to weigh conviction.

### Notifications

A coin gets a push notification when its score crosses `scoreThreshold`
(default 70), and won't re-fire for the same coin within `cooldownHours`
(default 12) unless the score jumps by `reNotifyScoreDelta` (default 10) or
more.

## Real-time setup (the path that actually works)

### 1. Get your Expo push token

```
npm install
npx expo start
```

Open the app on your phone (Expo Go, or a dev build), grant notification
permission, and it'll show your `ExponentPushToken[...]`. Long-press to copy
it.

### 2. Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox,
   Edge, Safari all supported) in the browser where you're logged into
   fomo.family.
2. Open the Tampermonkey dashboard → **Create a new script**.
3. Delete the placeholder contents and paste in
   [`userscript/prophet.user.js`](./userscript/prophet.user.js).
4. Edit the `CONFIG` block near the top:
   - `followedHandles`: the Fomo handles you want to track (e.g.
     `['lordlightning']`) — order matters, first = highest weight.
   - `expoPushTokens`: paste the token from step 1.
   - Adjust `scoreThreshold` / `cooldownHours` / `pollIntervalMinutes` if you
     want.
5. Save (Cmd+S). Make sure the script is enabled.
6. Open (or refresh) a `fomo.family` tab. Open the browser console
   (Cmd+Option+J) — you should see `[prophet] scored N coins...` logs on
   each poll, and a small status readout in the bottom-right corner of the
   page.

**It only runs while that tab is open** in that browser — it's not a
background cloud service. That's the trade-off for not fighting Cloudflare's
bot detection (see the top comment in `src/fomo/httpClient.ts` for why the
server-side approach doesn't work).

### 3. Calibrate field parsing

`normalizeSwap()` in the userscript guesses at fomo's JSON field names
(`side`, `symbol`, `amountUsd`, etc.) since scripted requests can't fetch a
sample response to confirm them (same Cloudflare issue). If the console logs
`unrecognized swap shape, skipping`, open that warning, look at the raw
object it prints, and add the real field name to the matching array in
`FIELD_CANDIDATES` at the top of the script.

## Mock/demo path (GitHub Actions, doesn't hit real Fomo data)

`npm run poll` / `.github/workflows/poll.yml` runs the same scoring +
notification logic on a schedule, but only against deterministic mock data —
useful for exercising the pipeline and Expo push wiring in CI, not for real
signals. To use it:

- `EXPO_PUSH_TOKEN` GitHub secret — same token as step 1 above.
- Enable Actions (Settings → Actions → General, if disabled by default).

It commits `data/state.json` back after each run so notification dedupe
state persists between runs.

## Local development

```
npm run poll        # run the pipeline once, against mock data by default
npm test             # scoring engine unit tests
npm run typecheck
```
