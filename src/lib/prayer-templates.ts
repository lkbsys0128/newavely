import { z } from "zod";
import { prayerEntrySchema, type PrayerEntry } from "./prayer-meetings";

export const prayerTemplateSchema = z.object({
  id: z.string().uuid().nullable(),
  version: z.number().int().min(0),
  name: z.string().trim().min(1, "템플릿 이름을 입력해주세요.").max(80),
  entries: z.array(prayerEntrySchema).min(1).max(100),
  clearContents: z.boolean().default(true),
  clearPrayerNames: z.boolean().default(true),
});
export type PrayerTemplate = { id: string; name: string; entries: PrayerEntry[]; version: number; updated_at: string };

export function preparePrayerTemplate(entries: PrayerEntry[], clearContents = true, clearPrayerNames = true): PrayerEntry[] {
  return entries.map(({ title, detail, sourceUrl }) => {
    if (/찬양|묵상|나눔|큐티/.test(title)) {
      return clearContents ? { title, detail: "" } : { title, detail, ...(sourceUrl ? { sourceUrl } : {}) };
    }
    if (clearPrayerNames && /기도/.test(`${title}\n${detail}`)) {
      const cleanLine = (line: string) => line.replace(/기도[^\r\n]*/u, "기도");
      return { title: cleanLine(title), detail: /기도/.test(detail)
        ? detail.split(/\r?\n/).map(cleanLine).join("\n") : "" };
    }
    return { title, detail, ...(sourceUrl ? { sourceUrl } : {}) };
  });
}
