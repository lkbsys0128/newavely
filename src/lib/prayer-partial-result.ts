import { z } from "zod";
import { buildBibleLink } from "./bible-links";
import { isBugsLyricsUrl, isDevotionalHost, partialPrayerDraftSchema, prayerGenerationResultSchema, type PrayerGenerationInput, type PrayerGenerationResult } from "./prayer-generation";
import { createPrayerGenerationDraft } from "./prayer-generation-draft";
import { safeSourceUrl } from "./prayer-source-search";

/** Retain fields independently; an unverified image never enters the editable draft. */
export async function preparePartialPrayer(input: PrayerGenerationInput, candidate: unknown,
  verify: (song: PrayerGenerationResult["songs"][number]) => Promise<boolean>,
  options: { createdAt: string; requestToken: string; now?: number; issues?: { code: string; songIndex: number | null }[] }) {
  const draft = createPrayerGenerationDraft(input);
  const issues: { entryIndex: number; message: string }[] = [];
  const raw = z.object({ songs: z.array(z.unknown()).max(8), devotional: z.unknown() }).safeParse(candidate);
  const now = options.now ?? Date.now();
  const fresh = (value: unknown) => {
    const parsed = z.iso.datetime().safeParse(value);
    if (!parsed.success) return false;
    const time = Date.parse(parsed.data);
    return time <= now + 300000 && time >= Math.max(Date.parse(options.createdAt) - 300000, now - 86400000);
  };
  const songs = [...input.beforeSongs, ...input.afterSongs];
  await Promise.all(songs.map(async (_, index) => {
    const blockers = (options.issues ?? []).filter((issue) => issue.songIndex === index + 1).map((issue) => issue.code);
    const entryIndex = index + 1 + (index >= input.beforeSongs.length ? 2 : 0);
    const entry = draft.entries[entryIndex];
    const parsed = z.object({ requestedTitle: z.string(), title: z.string().trim().min(1).max(120), artist: z.string().trim().min(1).max(120),
      verifiedAt: z.string(), lyricsUrl: z.string(), lyricsVerified: z.boolean(), scoreImageUrl: z.string(),
      additionalScoreImageUrls: z.array(z.string()).max(8).optional(), scoreSourceUrl: z.string() }).safeParse(raw.success ? raw.data.songs[index] : null);
    const song = parsed.success && parsed.data.requestedTitle === songs[index] && fresh(parsed.data.verifiedAt)
      && !blockers.includes("song_ambiguous") && !JSON.stringify(parsed.data).includes(options.requestToken) ? parsed.data : null;
    const urls: string[] = [];
    const labels: Record<string, string> = {};
    if (song?.lyricsVerified && !blockers.includes("lyrics_unavailable") && !blockers.includes("source_blocked") && isBugsLyricsUrl(song.lyricsUrl)) {
      urls.push(song.lyricsUrl); labels[song.lyricsUrl] = "가사";
    } else issues.push({ entryIndex, message: `찬양 ${index + 1} · 가사 확인 필요` });
    const pages = song ? [song.scoreImageUrl, ...(song.additionalScoreImageUrls ?? [])] : [];
    let verified = false;
    if (song && !blockers.includes("score_unavailable") && safeSourceUrl(song.scoreSourceUrl) && pages.length && new Set(pages).size === pages.length
      && pages.every((url) => safeSourceUrl(url) && !isDevotionalHost(url) && url !== song.scoreSourceUrl && url !== song.lyricsUrl)) {
      try { verified = await verify({ ...song, lyricsVerified: true, scoreImageVerified: false }); } catch { /* Preserve other fields after a failed image check. */ }
    }
    if (verified) pages.forEach((url, page) => { urls.push(url); labels[url] = pages.length === 1 ? "악보" : `악보 ${page + 1}`; });
    else issues.push({ entryIndex, message: `찬양 ${index + 1} · 악보 확인 필요` });
    if (urls.length) Object.assign(entry, { sourceUrl: urls[0], additionalSourceUrls: urls.slice(1), sourceLabels: labels });
  }));
  issues.sort((a, b) => a.entryIndex - b.entryIndex || a.message.localeCompare(b.message));
  const devotional = prayerGenerationResultSchema.shape.devotional.safeParse(raw.success ? raw.data.devotional : null);
  const entryIndex = input.beforeSongs.length + 2;
  if (devotional.success && !(options.issues ?? []).some((issue) => issue.code === "devotional_unavailable") && devotional.data.date === input.eventDate && fresh(devotional.data.verifiedAt)
    && !JSON.stringify(devotional.data).includes(options.requestToken)) {
    const value = devotional.data, url = buildBibleLink(value.book, value.chapter);
    draft.entries[entryIndex] = { title: "묵상/나눔", detail: `${value.passage}\n생명의삶 — ${value.title}`, sourceUrl: url, sourceLabels: { [url]: "성경 말씀" } };
  } else issues.push({ entryIndex, message: "묵상/나눔 · 말씀 확인 필요" });
  return partialPrayerDraftSchema.parse({ ...draft, issues });
}
