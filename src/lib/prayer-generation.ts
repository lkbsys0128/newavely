import { z } from "zod";
import { bibleBooks, buildBibleLink } from "./bible-links";
import { prayerMeetingSchema, type PrayerEntry } from "./prayer-meetings";
import { safeSourceUrl } from "./prayer-source-search";

const singleLine = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\r\n\u0000-\u001f]/.test(value), "한 줄로 입력해주세요.");
const sourceUrl = z.string().max(2000).refine(safeSourceUrl, "HTTPS 자료 링크를 확인해주세요.");
export const maxPrayerSongs = 8;
const songList = z.array(singleLine(120)).max(maxPrayerSongs);

export const prayerGenerationInputSchema = z.object({
  eventDate: prayerMeetingSchema.shape.eventDate,
  beforeSongs: songList,
  afterSongs: songList,
}).strict().refine((input) => input.beforeSongs.length + input.afterSongs.length >= 1
  && input.beforeSongs.length + input.afterSongs.length <= maxPrayerSongs, "찬양은 총 1~8곡을 입력해주세요.");
export const startPrayerGenerationSchema = prayerGenerationInputSchema.safeExtend({ requestId: z.string().uuid() });
export type PrayerGenerationInput = z.infer<typeof prayerGenerationInputSchema>;
export const partialPrayerDraftSchema = z.object({
  eventDate: prayerMeetingSchema.shape.eventDate,
  entries: prayerMeetingSchema.shape.entries,
  issues: z.array(z.object({ entryIndex: z.number().int().min(0).max(99), message: z.string().max(200) })).max(24),
});
export type PartialPrayerDraft = z.infer<typeof partialPrayerDraftSchema>;

export const generationStatuses = ["queued", "running", "needs_input", "completed", "failed", "cancelled"] as const;
export type GenerationStatus = typeof generationStatuses[number];
export type GenerationJob = {
  id: string;
  eventDate: string;
  beforeSongs: string[];
  afterSongs: string[];
  status: GenerationStatus;
  message: string;
  meetingId?: string;
  createdAt: string;
  updatedAt: string;
  draft?: PartialPrayerDraft;
  resultSummary?: {
    songs?: { title: string; artist: string }[];
    passage?: string;
    devotionalTitle?: string;
    notes?: string[];
  };
};

export function isGenerationPending(status: GenerationStatus) {
  return status === "queued" || status === "running";
}

export function isBugsLyricsUrl(value: string) {
  if (!safeSourceUrl(value)) return false;
  const url = new URL(value);
  return url.hostname === "music.bugs.co.kr" && !url.port && /^\/track\/\d+\/?$/.test(url.pathname) && !url.search && !url.hash;
}

export function isOfficialDevotionalUrl(value: string) {
  if (!safeSourceUrl(value)) return false;
  const url = new URL(value);
  return !url.port && ["duranno.com", "www.duranno.com", "fondant.kr", "www.fondant.kr"].includes(url.hostname);
}

export function isDevotionalHost(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return ["duranno.com", "fondant.kr", "cgntv.net"].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch { return false; }
}

const verifiedSongSchema = z.object({
  requestedTitle: singleLine(120),
  title: singleLine(120),
  artist: singleLine(120),
  lyricsUrl: sourceUrl.refine(isBugsLyricsUrl, "벅스 곡 페이지 주소가 필요합니다."),
  scoreImageUrl: sourceUrl.refine((value) => !isDevotionalHost(value), "생명의삶 출처는 악보 링크로 넣을 수 없습니다."),
  additionalScoreImageUrls: z.array(sourceUrl.refine((value) => !isDevotionalHost(value))).max(8).optional(),
  scoreSourceUrl: sourceUrl,
  scoreKey: singleLine(40).optional(),
  lyricsVerified: z.literal(true),
  scoreImageVerified: z.boolean(),
  verifiedAt: z.iso.datetime(),
}).strict().refine((song) => {
  const pages = [song.scoreImageUrl, ...(song.additionalScoreImageUrls ?? [])];
  return new Set(pages).size === pages.length && pages.every((url) => url !== song.scoreSourceUrl && url !== song.lyricsUrl);
},
  "악보 원문 글과 실제 이미지 주소를 구분해주세요.");

export const prayerGenerationResultSchema = z.object({
  songs: z.array(verifiedSongSchema).min(1).max(maxPrayerSongs),
  devotional: z.object({
    date: prayerMeetingSchema.shape.eventDate,
    title: singleLine(120),
    book: z.number().int().min(1).max(66),
    chapter: z.number().int().min(1).max(150),
    passage: singleLine(120),
    sourceUrl: sourceUrl.refine(isOfficialDevotionalUrl, "해당 날짜의 공식 생명의삶 출처가 필요합니다."),
    verifiedAt: z.iso.datetime(),
  }).strict().superRefine((value, context) => {
    const book = bibleBooks[value.book - 1];
    if (!book || !buildBibleLink(value.book, value.chapter)) {
      context.addIssue({ code: "custom", path: ["chapter"], message: "성경 책과 장을 확인해주세요." });
      return;
    }
    const pattern = new RegExp(`^${book[0]} ${value.chapter}:([1-9][0-9]{0,2})(?:[-–](?:([1-9][0-9]{0,2}):)?([1-9][0-9]{0,2}))?$`);
    const range = value.passage.match(pattern);
    const endChapter = range?.[2] ? Number(range[2]) : value.chapter;
    const endVerse = range?.[3] ? Number(range[3]) : Number(range?.[1]);
    if (!range || endChapter < value.chapter || endChapter > book[1] || (endChapter === value.chapter && endVerse < Number(range[1]))) {
      context.addIssue({ code: "custom", path: ["passage"], message: "성경 범위의 책·장과 절 순서를 확인해주세요." });
    }
  }),
  notes: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
}).strict();
export type PrayerGenerationResult = z.infer<typeof prayerGenerationResultSchema>;

export const generationCapabilitySchema = {
  requestId: z.string().uuid(),
  requestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "유효한 요청 인증 정보가 필요합니다."),
};

/** The agent supplies verified metadata; only the server chooses date, order and published links. */
export function prepareGeneratedPrayer(
  input: PrayerGenerationInput,
  candidate: unknown,
  options: { now?: number; createdAt?: string; requestToken?: string } = {},
): { result: PrayerGenerationResult; entries: PrayerEntry[] } {
  const result = prayerGenerationResultSchema.parse(candidate);
  if (result.songs.some((song) => !song.scoreImageVerified)) throw new Error("악보 이미지 확인이 필요합니다.");
  const expected = [...input.beforeSongs, ...input.afterSongs];
  if (result.devotional.date !== input.eventDate) throw new Error("말씀 자료의 날짜가 기도회 날짜와 다릅니다.");
  if (result.songs.length !== expected.length || result.songs.some((song, index) => song.requestedTitle !== expected[index])) throw new Error("찬양 순서 또는 요청한 곡이 일치하지 않습니다.");
  const now = options.now ?? Date.now();
  const createdAt = options.createdAt ? Date.parse(options.createdAt) : now - 24 * 60 * 60 * 1000;
  for (const checked of [...result.songs, result.devotional]) {
    const time = Date.parse(checked.verifiedAt);
    if (time > now + 5 * 60 * 1000 || time < Math.max(createdAt - 5 * 60 * 1000, now - 24 * 60 * 60 * 1000)) {
      throw new Error("자료를 이번 요청에서 다시 확인해주세요.");
    }
  }
  if (options.requestToken) {
    const serialized = JSON.stringify(result);
    if (serialized.includes(options.requestToken)) throw new Error("요청 인증 정보는 결과에 포함할 수 없습니다.");
  }
  const songs = result.songs.map((song): PrayerEntry => ({
    title: "찬양", detail: song.title, sourceUrl: song.lyricsUrl,
    additionalSourceUrls: [song.scoreImageUrl, ...(song.additionalScoreImageUrls ?? [])],
    sourceLabels: { [song.lyricsUrl]: "가사", ...Object.fromEntries([song.scoreImageUrl, ...(song.additionalScoreImageUrls ?? [])]
      .map((url, index, pages) => [url, pages.length === 1 ? "악보" : `악보 ${index + 1}`])) },
  }));
  const devotional = result.devotional;
  const bibleLink = buildBibleLink(devotional.book, devotional.chapter);
  const entries: PrayerEntry[] = [
    { title: "기도", detail: "시작기도" }, ...songs.slice(0, input.beforeSongs.length),
    { title: "기도", detail: "릴레이 기도\n마무리 기도" },
    { title: "묵상/나눔", detail: `${devotional.passage}\n생명의삶 — ${devotional.title}`, sourceUrl: bibleLink,
      sourceLabels: { [bibleLink]: "성경 말씀" } },
    ...songs.slice(input.beforeSongs.length), { title: "기도", detail: "통성기도\n마무리 기도" },
  ];
  prayerMeetingSchema.parse({ id: null, version: 0, eventDate: input.eventDate, entries });
  return { result, entries };
}

const publicJobSchema = z.object({
  id: z.string().uuid(), event_date: z.string(), input: prayerGenerationInputSchema,
  status: z.enum(generationStatuses), message: z.string().nullable().optional(),
  meeting_id: z.string().uuid().nullable().optional(), created_at: z.string(), updated_at: z.string(),
  draft: partialPrayerDraftSchema.nullable().optional(),
  result_summary: z.object({
    songs: z.array(z.object({ title: z.string(), artist: z.string() })).optional(),
    passage: z.string().optional(), devotionalTitle: z.string().optional(), notes: z.array(z.string()).optional(),
  }).nullable().optional(),
});

/** Explicit projection: never forward DB/provider/capability fields to a browser. */
export function toGenerationJob(value: unknown): GenerationJob {
  const row = publicJobSchema.parse(value);
  return { id: row.id, eventDate: row.event_date, beforeSongs: row.input.beforeSongs, afterSongs: row.input.afterSongs,
    status: row.status, message: row.message ?? "", ...(row.meeting_id ? { meetingId: row.meeting_id } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.draft ? { draft: row.draft } : {}),
    ...(row.result_summary ? { resultSummary: row.result_summary } : {}) };
}
