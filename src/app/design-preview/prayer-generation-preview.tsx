"use client";

import { useMemo, useState } from "react";
import { PrayerGenerationPanel } from "@/components/prayer-generation-panel";
import type { GenerationJob } from "@/lib/prayer-generation";
import { createPrayerGenerationDraft } from "@/lib/prayer-generation-draft";
import { PrayerEntryLinks } from "@/components/prayer-entry-links";

// This fixture is reachable only through the development-only design-preview route.
export function PrayerGenerationPreview({ today, state }: { today: string; state?: string }) {
  const [draft, setDraft] = useState<ReturnType<typeof createPrayerGenerationDraft> | null>(null);
  const actions = useMemo(() => {
    let job: GenerationJob = {
      id: "aaaaaaaa-0000-4000-8000-000000000001", eventDate: today,
      beforeSongs: ["목마른 사슴", "그 사랑 얼마나"], afterSongs: ["내 이름 아시죠", "주의 아름다움은 말로 다"],
      status: state === "completed" ? "completed" : "running", message: state === "completed" ? "기도회를 생성하고 저장했습니다. (미리보기)" : "찬양과 말씀 자료를 확인하고 있습니다. (미리보기)",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...(state === "completed" ? { meetingId: "bbbbbbbb-0000-4000-8000-000000000001", resultSummary: {
        songs: [{ title: "목마른 사슴", artist: "올네이션스 경배와찬양" }], passage: "아모스 1:9–15", devotionalTitle: "미리보기 말씀 제목",
      } } : {}),
    };
    if (state === "partial") {
      const draft = createPrayerGenerationDraft({ eventDate: job.eventDate, beforeSongs: job.beforeSongs, afterSongs: job.afterSongs });
      draft.entries.filter((entry) => entry.title === "찬양").forEach((entry, index) => {
        entry.sourceUrl = `https://music.bugs.co.kr/track/${1000 + index}`;
        entry.sourceLabels = { [entry.sourceUrl]: "가사" };
      });
      job = { ...job, status: "needs_input", message: "확인된 자료를 비공개 초안에 보관했습니다.",
        draft: { ...draft, issues: [{ entryIndex: 6, message: "찬양 4 · 악보 확인 필요" }] } };
    }
    const result = () => ({ ok: true, message: job.message, job });
    return {
      listOwnPrayerGenerationJobs: async () => ({ ok: true, message: "", jobs: state ? [job] : [] }),
      getPrayerGenerationJob: async () => result(),
      startPrayerGeneration: async () => result(),
      cancelPrayerGeneration: async () => { job = { ...job, status: "cancelled", message: "생성 요청을 취소했습니다.", updatedAt: new Date().toISOString() }; return result(); },
    };
  }, [today, state]);
  return draft ? <ol className="prayer-program">{draft.entries.map((entry, index) => <li key={index}>{entry.title}: {entry.detail}<PrayerEntryLinks entry={entry} /></li>)}</ol>
    : <PrayerGenerationPanel today={today} generationEnabled open onClose={() => {}} actions={actions} onEditDraft={(input) => setDraft(createPrayerGenerationDraft({ eventDate: input.eventDate, beforeSongs: input.beforeSongs, afterSongs: input.afterSongs }, input.savedDraft))} />;
}
