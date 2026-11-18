import { partialPrayerDraftSchema, prayerGenerationInputSchema } from "./prayer-generation";
import type { PrayerEntry } from "./prayer-meetings";

/** Restore a server-validated private draft, or fall back to the original song input. */
export function createPrayerGenerationDraft(input: unknown, savedDraft?: unknown): { eventDate: string; entries: PrayerEntry[] } {
  const parsed = prayerGenerationInputSchema.parse(input);
  const saved = partialPrayerDraftSchema.safeParse(savedDraft);
  if (saved.success && saved.data.eventDate === parsed.eventDate && saved.data.entries.length === parsed.beforeSongs.length + parsed.afterSongs.length + 4) return saved.data;
  const songs = [...parsed.beforeSongs, ...parsed.afterSongs].map((detail) => ({ title: "찬양", detail }));
  return { eventDate: parsed.eventDate, entries: [
    { title: "기도", detail: "시작기도" }, ...songs.slice(0, parsed.beforeSongs.length),
    { title: "기도", detail: "릴레이 기도\n마무리 기도" },
    { title: "묵상/나눔", detail: "" }, ...songs.slice(parsed.beforeSongs.length),
    { title: "기도", detail: "통성기도\n마무리 기도" },
  ] };
}
