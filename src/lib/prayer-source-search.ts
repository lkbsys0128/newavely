export type PrayerSourceResult = { title: string; url: string; domain: string };

export function safeSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && value.length <= 2000
      && url.hostname.includes(".") && !url.hostname.endsWith(".local")
      && !url.hostname.endsWith(".localhost") && !/^[\d.]+$/.test(url.hostname)
      && !url.hostname.includes(":");
  } catch { return false; }
}

export async function fetchPrayerSources(query: string, apiKey: string, request: typeof fetch = fetch): Promise<PrayerSourceResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.search = new URLSearchParams({ q: `${query} 찬양 가사 lyrics`, count: "5", text_decorations: "false", safesearch: "strict" }).toString();
  const response = await request(url, { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("search-unavailable");
  const payload: unknown = await response.json();
  const results = (payload as { web?: { results?: unknown } })?.web?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  return results.flatMap((item): PrayerSourceResult[] => {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string" || !safeSourceUrl(item.url) || seen.has(item.url)) return [];
    seen.add(item.url);
    return [{ title: item.title.slice(0, 200), url: item.url, domain: new URL(item.url).hostname }];
  }).slice(0, 5);
}
