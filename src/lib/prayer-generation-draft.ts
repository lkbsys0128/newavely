import { prayerGenerationInputSchema } from "./prayer-generation";
import type { PrayerEntry } from "./prayer-meetings";

/** Preserve only user input; never promote unverified model output to saved evidence. */
export function createPrayerGenerationDraft(input: unknown): { eventDate: string; entries: PrayerEntry[] } {
  const parsed = prayerGenerationInputSchema.parse(input);
  const songs = [...parsed.beforeSongs, ...parsed.afterSongs].map((detail) => ({ title: "찬양", detail }));
  return { eventDate: parsed.eventDate, entries: [
    { title: "기도", detail: "시작기도" }, ...songs.slice(0, parsed.beforeSongs.length),
    { title: "기도", detail: "릴레이 기도\n마무리 기도" },
    { title: "묵상/나눔", detail: "" }, ...songs.slice(parsed.beforeSongs.length),
    { title: "기도", detail: "통성기도\n마무리 기도" },
  ] };
}
