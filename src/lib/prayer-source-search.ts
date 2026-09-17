import { decodeHTML } from "entities";

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

export async function fetchPrayerSources(query: string, credentials: { clientId: string; clientSecret: string }, request: typeof fetch = fetch): Promise<PrayerSourceResult[]> {
  const sources: PrayerSourceResult[][] = [];
  let failed = false;
  for (const category of ["webkr", "blog"]) {
    try {
      const url = new URL(`https://openapi.naver.com/v1/search/${category}.json`);
      url.search = new URLSearchParams({ query: `${query} 찬양 가사`, display: "5", start: "1" }).toString();
      const response = await request(url, { headers: { "X-Naver-Client-Id": credentials.clientId, "X-Naver-Client-Secret": credentials.clientSecret, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("search-unavailable");
      const payload: unknown = await response.json();
      const items = (payload as { items?: unknown })?.items;
      if (!Array.isArray(items)) throw new Error("invalid-search-response");
      sources.push(items.flatMap((item): PrayerSourceResult[] => {
        if (!item || typeof item.title !== "string" || typeof item.link !== "string") return [];
        // Naver blog results can still contain legacy HTTP links.
        const link = item.link.replace(/^http:\/\/(m\.)?blog\.naver\.com\//i, "https://blog.naver.com/");
        if (!safeSourceUrl(link)) return [];
        const title = decodeHTML(item.title.replace(/<\/?b>/gi, "")).trim().slice(0, 200);
        return title ? [{ title, url: link, domain: new URL(link).hostname }] : [];
      }));
    } catch { failed = true; sources.push([]); }
  }
  // Alternate web and blog results so neither category hides the other.
  const seen = new Set<string>();
  const results: PrayerSourceResult[] = [];
  for (let index = 0; index < 5; index++) {
    for (const source of sources) {
      const item = source[index];
      if (item && !seen.has(item.url)) { seen.add(item.url); results.push(item); }
    }
  }
  if (!results.length && failed) throw new Error("search-unavailable");
  return results.slice(0, 6);
}
