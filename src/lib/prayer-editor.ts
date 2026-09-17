import type { PrayerEntry } from "./prayer-meetings";

export const prayerItemTypes = ["기도", "찬양", "묵상/나눔"] as const;
export type PrayerEditEntry = PrayerEntry & { key: string; kind: string; customTitle: string };

export function toPrayerEditEntry(entry: PrayerEntry, key: string): PrayerEditEntry {
  const preset = prayerItemTypes.some((type) => type === entry.title);
  return { ...entry, key, kind: preset ? entry.title : "custom", customTitle: preset ? "" : entry.title };
}

export function changePrayerItemType(entry: PrayerEditEntry, kind: string): PrayerEditEntry {
  return { ...entry, kind, title: kind === "custom" ? entry.customTitle : kind };
}

export function selectPrayerSource(entry: PrayerEditEntry, sourceUrl: string, songTitle?: string): PrayerEditEntry {
  const title = songTitle?.trim();
  return { ...entry, sourceUrl, detail: sourceUrl && entry.kind === "찬양" && title ? title : entry.detail };
}
