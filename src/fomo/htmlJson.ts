/**
 * Best-effort extractor for embedded JSON state in server-rendered HTML.
 * Many React/Next.js apps embed their initial data in a script tag
 * (__NEXT_DATA__, __NUXT__, or a generic `application/json` tag). This is a
 * generic fallback used until fomo.family's actual data shape is confirmed
 * (network access to fomo.family is currently blocked for this session — see
 * README "Wiring up the real Fomo API").
 */
export function extractEmbeddedJson(html: string): unknown[] {
  const results: unknown[] = [];
  const patterns = [
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/i,
  ];

  for (const pattern of patterns) {
    if (pattern.global) {
      for (const match of html.matchAll(pattern)) {
        tryParse(match[1], results);
      }
    } else {
      const match = html.match(pattern);
      if (match) tryParse(match[1], results);
    }
  }

  return results;
}

function tryParse(raw: string | undefined, out: unknown[]): void {
  if (!raw) return;
  try {
    out.push(JSON.parse(raw));
  } catch {
    // Not JSON, or not parseable as-is — ignore and let the caller fall back.
  }
}
