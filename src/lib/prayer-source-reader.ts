import { load } from "cheerio";
import { z } from "zod";

const maxBytes = 2_000_000;
export const prayerSourceArguments = z.object({ urls: z.array(z.string().max(4000)).min(1).max(8) }).strict();

/** Only public provider-owned hosts, never arbitrary fetches, credentials or redirects. */
export function prayerSourceUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
    if (url.hostname === "music.bugs.co.kr" && /^\/track\/\d+$/.test(url.pathname) && !url.search) return url;
    if (url.hostname === "www.duranno.com" && url.pathname === "/qt/view/bible.asp"
      && [...url.searchParams.keys()].length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("qtDate") ?? "")) return url;
    if (["www.fondant.kr", "fondant.kr"].includes(url.hostname) && /^\/(series|episode)\/[A-Za-z0-9-]+\/?$/.test(url.pathname)
      && [...url.searchParams.keys()].every((key) => key === "category")) return url;
    if (/^[a-z0-9-]+\.tistory\.com$/.test(url.hostname) && /^\/(\d+|entry\/[^/]+)\/?$/.test(url.pathname) && !url.search) return url;
  } catch { /* Malformed or unsupported URLs are data, not fetch targets. */ }
  return null;
}

function imageUrl(value: string, source: URL) {
  try {
    const url = new URL(value, source);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.href.length > 4000) return null;
    if (["blog.kakaocdn.net", "t1.daumcdn.net", "img1.daumcdn.net", "img.daumcdn.net"].includes(url.hostname)
      && (/\.(png|jpe?g|webp|gif)$/i.test(url.pathname) || url.pathname.startsWith("/thumb/"))) return url.href;
  } catch { /* Ignore non-URL image attributes. */ }
  return null;
}

export function parsePrayerSource(html: string, url: URL) {
  const $ = load(html);
  const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 500);
  const meta = (name: string) => clean($(`meta[property="${name}"]`).attr("content") ?? "");
  const title = meta("og:title") || clean($("title").text());
  if (url.hostname === "music.bugs.co.kr") {
    // Never return lyrics text to the model, logs, or database.
    const lyrics = $(".lyricsContainer xmp").text().trim();
    return { kind: "song", title: meta("sc:track_title"), artist: meta("sc:artist_nm"),
      album: meta("sc:album_title"), lyricsPresent: lyrics.length > 0 && !/가사.{0,20}(없습니다|준비|등록해)|no lyrics/i.test(lyrics),
      credits: $(".summaryTrack table.info tr").toArray().map((row) => ({
        label: clean($(row).find("th").text()), value: clean($(row).find("td").text()),
      })).filter((row) => ["작사", "작곡", "편곡"].includes(row.label)) };
  }
  if (url.hostname === "www.duranno.com") {
    return { kind: "devotional", date: clean($(".date").text()).match(/\d{4}\.\d{2}\.\d{2}/)?.[0] ?? "",
      title: clean($("h1 em").text()), passage: clean($("h1 span").text()) };
  }
  $("script, style, nav, header, footer, form").remove();
  if (url.hostname.endsWith("tistory.com")) {
    const article = $(".tt_article_useless_p_margin, .contents_style, article").first();
    const images = new Set<string>();
    article.find("img, a[href]").each((_index, element) => {
      for (const attribute of ["data-origin-src", "data-url", "src", "href"]) {
        const value = $(element).attr(attribute);
        const parsed = value ? imageUrl(value, url) : null;
        if (parsed && images.size < 24) images.add(parsed);
      }
    });
    return { kind: "score_candidates", title, images: [...images], imageVerified: false };
  }
  return { kind: "official_episode_candidates", title,
    headings: $("h1, h2, h3, time").toArray().slice(0, 24).map((element) => clean($(element).text())),
    links: $("a[href]").toArray().flatMap((element) => {
      try {
        const target = new URL($(element).attr("href") ?? "", url);
        return prayerSourceUrl(target.href) ? [{ title: clean($(element).text()), url: target.href }] : [];
      } catch { return []; }
    }).slice(0, 30) };
}

export async function readPrayerSource(value: string, request: typeof fetch = fetch) {
  const url = prayerSourceUrl(value);
  if (!url) return { status: "unsupported_source" };
  try {
    const response = await request(url.href, { cache: "no-store", redirect: "error", credentials: "omit",
      signal: AbortSignal.timeout(10000), headers: { Accept: "text/html", "User-Agent": "NewavelySourceVerifier/1.0" } });
    if (!response.ok) return { status: "source_unavailable", httpStatus: response.status };
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return { status: "unsupported_content" };
    if (Number(response.headers.get("content-length")) > maxBytes || !response.body) return { status: "source_too_large" };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        bytes += chunk.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); return { status: "source_too_large" }; }
        chunks.push(chunk);
      }
    } finally { reader.releaseLock(); }
    const buffer = Buffer.concat(chunks);
    const encodingHint = contentType + buffer.subarray(0, 2048).toString("ascii");
    const html = new TextDecoder(/euc-kr|ks_c_5601|windows-949/i.test(encodingHint) ? "euc-kr" : "utf-8").decode(buffer);
    return { status: "read", url: url.href, verifiedAt: new Date().toISOString(), ...parsePrayerSource(html, url) };
  } catch { return { status: "source_unavailable" }; }
}

export async function readPrayerSources(argumentsJson: string) {
  const input = prayerSourceArguments.parse(JSON.parse(argumentsJson));
  return Promise.all(input.urls.map((url) => readPrayerSource(url)));
}
