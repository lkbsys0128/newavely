import { z } from "zod";
import { safeSourceUrl } from "./prayer-source-search";

export const prayerEntrySchema = z.object({
  title: z.string().trim().min(1, "항목 이름을 입력해주세요.").max(120),
  detail: z.string().trim().max(500).default(""),
  sourceUrl: z.string().refine((value) => value === "" || safeSourceUrl(value), "HTTPS 원문 링크를 확인해주세요.").optional(),
});
export const prayerMeetingSchema = z.object({
  id: z.string().uuid().nullable(),
  version: z.number().int().min(0),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "올바른 날짜를 선택해주세요."),
  entries: z.array(prayerEntrySchema).min(1, "순서를 하나 이상 추가해주세요.").max(100),
});

export type PrayerEntry = z.infer<typeof prayerEntrySchema>;
export type PrayerMeeting = {
  id: string;
  event_date: string;
  entries: PrayerEntry[];
  version: number;
  created_at: string;
  updated_at: string;
};
export type PrayerSummary = Pick<PrayerMeeting, "id" | "event_date" | "created_at">;

export function seattleDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function formatPrayerDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "long" })
    .format(new Date(`${value}T12:00:00Z`));
}
