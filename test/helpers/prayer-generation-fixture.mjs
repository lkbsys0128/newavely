export const requestId = "40000000-0000-4000-8000-000000000001";
export const input = {
  eventDate: "2026-11-04", beforeSongs: ["목마른 사슴", "그 사랑 얼마나"], afterSongs: ["내 이름 아시죠", "주의 아름다움은 말로 다"],
};
export const configuredEnv = {
  PRAYER_GENERATION_ENABLED: "true", PRAYER_AGENT_TRIGGER_ID: "agtch_test_channel",
  PRAYER_AGENT_ACCESS_TOKEN: "fixture-workspace-token", PRAYER_AGENT_SIGNING_SECRET: "fixture-secret-only-for-tests-32-characters",
  PRAYER_AGENT_APP_URL: "https://newavely.example.test",
};
export function verifiedResult(verifiedAt = "2026-11-04T20:00:00.000Z") {
  return {
    songs: [...input.beforeSongs, ...input.afterSongs].map((title, index) => ({
      requestedTitle: title, title, artist: `테스트 가수 ${index + 1}`,
      lyricsUrl: `https://music.bugs.co.kr/track/${1000 + index}`,
      scoreImageUrl: `https://images.example.test/score-${index}.png`, scoreSourceUrl: `https://scores.example.test/song-${index}`,
      lyricsVerified: true, scoreImageVerified: true, verifiedAt,
    })),
    devotional: { date: input.eventDate, title: "검증용 제목", book: 30, chapter: 1, passage: "아모스 1:9–15",
      sourceUrl: `https://www.duranno.com/qt/view/bible.asp?qtDate=${input.eventDate}`, verifiedAt },
    notes: [],
  };
}
export function jobRow(overrides = {}) {
  return { id: requestId, event_date: input.eventDate, input, status: "queued", message: "접수됨", meeting_id: null,
    created_at: "2026-11-04T19:59:00.000Z", updated_at: "2026-11-04T19:59:00.000Z", result_summary: null, dispatched: false, ...overrides };
}
