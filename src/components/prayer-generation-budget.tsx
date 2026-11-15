"use client";

import { useEffect, useState } from "react";
import { getPrayerGenerationBudget } from "@/app/prayer/generation-actions";

type Budget = NonNullable<Awaited<ReturnType<typeof getPrayerGenerationBudget>>>;

export function PrayerGenerationBudget({ songCount, revision, onAvailable, loadBudget = getPrayerGenerationBudget }: { songCount: number; revision: string; onAvailable: (available: boolean) => void; loadBudget?: typeof getPrayerGenerationBudget }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadBudget(songCount).then((value) => {
      if (!cancelled) { setBudget(value); setLoading(false); onAvailable(value?.canGenerate ?? true); }
    }).catch(() => { if (!cancelled) { setBudget(null); setLoading(false); onAvailable(true); } });
    return () => { cancelled = true; };
  }, [songCount, revision, onAvailable, loadBudget]);
  return <div className="prayer-generation-budget" aria-live="polite" aria-busy={loading}>
    {loading ? <p className="meta">이번 달 생성 한도 확인 중...</p> : budget ? <>
      <div className="prayer-budget-label"><span>이번 달 공동체 사용량</span><strong>{budget.usedPercent}%</strong></div>
      <progress max={100} value={budget.usedPercent} aria-label="이번 달 공동체 사용량 (예약 포함)" />
      <p className="meta">이번 생성 예상 {budget.estimatedPercent}% · 여유분 포함 {budget.reservedPercent}% 예약</p>
      <p className="meta">예약 포함 · {budget.resetsOn} 시애틀 기준 초기화</p>
      {!budget.canGenerate ? <p role="alert">이번 달 AI 생성 한도가 부족합니다. 추가 생성이 필요하면 관리자에게 연락해주세요. 직접 작성은 계속 사용할 수 있습니다.</p> : null}
    </> : <p className="meta">한도를 불러오지 못했습니다. 생성 요청 시 서버에서 다시 확인합니다.</p>}
  </div>;
}
