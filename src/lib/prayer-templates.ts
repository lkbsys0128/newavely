import { z } from "zod";
import { prayerEntrySchema, type PrayerEntry } from "./prayer-meetings";

export const prayerTemplateSchema = z.object({
  id: z.string().uuid().nullable(),
  version: z.number().int().min(0),
  name: z.string().trim().min(1, "템플릿 이름을 입력해주세요.").max(80),
  entries: z.array(prayerEntrySchema).min(1).max(100),
  clearContents: z.boolean().default(true),
});
export type PrayerTemplate = { id: string; name: string; entries: PrayerEntry[]; version: number; updated_at: string };

export function preparePrayerTemplate(entries: PrayerEntry[], clearContents = true): PrayerEntry[] {
  return entries.map(({ title, detail, sourceUrl }) => {
    if (!clearContents) return { title, detail, ...(sourceUrl ? { sourceUrl } : {}) };
    if (/찬양|묵상|나눔|큐티/.test(title)) return { title, detail: "" };
    const closing = /마무리\s*기도/;
    const titleMatch = closing.exec(title);
    if (titleMatch) return { title: title.slice(0, titleMatch.index + titleMatch[0].length), detail: "" };
    const detailMatch = closing.exec(detail);
    return { title, detail: detailMatch ? detail.slice(0, detailMatch.index + detailMatch[0].length) : detail,
      ...(sourceUrl ? { sourceUrl } : {}) };
  });
}
