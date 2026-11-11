"use client";

import { useMemo } from "react";
import { PrayerGenerationPanel } from "@/components/prayer-generation-panel";
import type { GenerationJob } from "@/lib/prayer-generation";

// This fixture is reachable only through the development-only design-preview route.
export function PrayerGenerationPreview({ today, state }: { today: string; state?: string }) {
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
    const result = () => ({ ok: true, message: job.message, job });
    return {
      listOwnPrayerGenerationJobs: async () => ({ ok: true, message: "", jobs: state ? [job] : [] }),
      getPrayerGenerationJob: async () => result(),
      startPrayerGeneration: async () => result(),
      cancelPrayerGeneration: async () => { job = { ...job, status: "cancelled", message: "생성 요청을 취소했습니다.", updatedAt: new Date().toISOString() }; return result(); },
    };
  }, [today, state]);
  return <PrayerGenerationPanel today={today} generationEnabled open onClose={() => {}} actions={actions} />;
}
