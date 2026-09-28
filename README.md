# Prophet

Watches the top 100 traders on [Fomo](https://fomo.family), aggregates their
buys, sells, and posted theses into a per-coin "promise score," and sends you
a push notification when a coin looks worth a look.

## How it works

```
src/fomo/        Pluggable Fomo data source (mock client + real HTTP scaffold)
src/scoring/     Aggregates trades + thesis sentiment into a 0-100 score per coin
src/notify/      Sends the alert via Expo's push notification service
src/state/       Tracks which coins were already notified on, so you don't get spammed
src/pipeline.ts  Wires the above together: fetch -> score -> filter -> notify -> persist
scripts/poll-and-notify.ts   CLI entry point run by the scheduled job
.github/workflows/poll.yml   Runs the pipeline every 15 minutes via GitHub Actions
App.tsx          Minimal Expo app: grants notification permission, shows your push token
```

### Scoring

For each coin, across the configured top-N traders (default 100):

- Each trader is weighted by leaderboard rank (`1/sqrt(rank)`), so a top-1
  trader's activity counts for more than a top-100 trader's.
- Buys add weight, sells subtract it → a trade signal in `[-1, 1]`.
- Each posted thesis is scored with a lightweight bullish/bearish keyword
  lexicon (`src/scoring/keywords.ts`) → a sentiment signal in `[-1, 1]`.
- Combined signal = `0.7 * tradeSignal + 0.3 * sentiment`, mapped to `0-100`.

This is a heuristic, not investment advice — tune the weights and keyword
lists in `src/scoring/` to match how you actually want to weigh conviction.

### Notifications

A coin gets a push notification when its score crosses `scoreThreshold`
(default 70), and won't re-fire for the same coin within `cooldownHours`
(default 12) unless the score jumps by `reNotifyScoreDelta` (default 10) or
more. See `DEFAULT_CONFIG` in `src/pipeline.ts`.

## Setup

### 1. Get your Expo push token

```
npm install
npx expo start
```

Open the app on your phone (Expo Go, or a dev build), grant notification
permission, and it'll show your `ExponentPushToken[...]`. Long-press to copy
it.

### 2. Add GitHub secrets

In the repo's **Settings → Secrets and variables → Actions**:

- `EXPO_PUSH_TOKEN` — the token from step 1 (comma-separate multiple tokens
  if more than one device should get alerts).
- `FOMO_SESSION_COOKIE` — only needed once the real Fomo integration is wired
  up, if trade history/theses require a logged-in session.

And under **Variables**:

- `FOMO_BASE_URL` — e.g. `https://fomo.family`. Until this is set, the
  pipeline runs against deterministic mock data (see below), which is useful
  for confirming the workflow fires correctly end to end.

### 3. Enable the workflow

`.github/workflows/poll.yml` runs on a 15-minute cron once the repo is
pushed and Actions are enabled (Settings → Actions → General, if disabled by
default). It commits `data/state.json` back after each run so notification
dedupe state persists between runs.

## Wiring up the real Fomo API

This was scaffolded before network access to `fomo.family` was available to
inspect the site, so `src/fomo/httpClient.ts` is an **unverified stub**: it
fetches the leaderboard/profile pages and tries a generic embedded-JSON
extractor, but `parseTradersFromHtml` / `parseActivityFromHtml` are
unimplemented placeholders that need the real data shape filled in.

To finish it:

1. Inspect `https://fomo.family/leaderboard` (or wherever the top-100 list
   actually lives) and a profile page like
   `https://fomo.family/profile/lordlightning` — check whether trade history
   and posted theses are public or require a logged-in session.
2. Implement `parseTradersFromHtml` and `parseActivityFromHtml` in
   `src/fomo/httpClient.ts` to map the real response shape onto the `Trader`
   / `Trade` / `Thesis` types in `src/types.ts`.
3. Set the `FOMO_BASE_URL` repo variable (and `FOMO_SESSION_COOKIE` secret,
   if needed) — `src/fomo/index.ts` automatically switches from the mock
   client to the real one once `FOMO_BASE_URL` is set.

## Local development

```
npm run poll        # run the pipeline once, against mock data by default
npm test             # scoring engine unit tests
npm run typecheck
```
