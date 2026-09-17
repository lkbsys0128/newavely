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

export async function fetchPrayerSources(query: string, apiKey: string, request: typeof fetch = fetch): Promise<PrayerSourceResult[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google", q: `${query} 찬양 가사`, hl: "ko", gl: "kr", api_key: apiKey }).toString();
  // The provider requires the key in the query; never log this URL or return metadata.
  const response = await request(url, { headers: { Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("search-unavailable");
  const payload = await response.json() as { organic_results?: unknown; error?: unknown; search_metadata?: { status?: string } } | null;
  if (!payload || payload.error || payload.search_metadata?.status !== "Success") throw new Error("search-unavailable");
  const items = payload.organic_results ?? [];
  if (!Array.isArray(items)) throw new Error("invalid-search-response");
  const seen = new Set<string>();
  const results: PrayerSourceResult[] = [];
  for (const item of items) {
    if (!item || typeof item.title !== "string" || typeof item.link !== "string" || !safeSourceUrl(item.link)) continue;
    const link = new URL(item.link).href;
    const title = decodeHTML(item.title).trim().slice(0, 200);
    if (!title || seen.has(link)) continue;
    seen.add(link);
    results.push({ title, url: link, domain: new URL(link).hostname });
  }
  return results.slice(0, 6);
}
