import { createClient } from "@/lib/supabase/server";

type UsageRow = { id: string; event_date: string; status: string; calls: number; vision_calls: number;
  input_tokens: number | null; cached_tokens: number | null; output_tokens: number | null;
  search_calls: number; estimated_usd: number | null; unpriced_calls: number };
type UsageReport = { estimated_usd: number | null; calls: number; untracked_requests: number;
  unpriced_calls: number; rows: UsageRow[] };
const money = (value: number | null) => value === null ? "미수집" : `$${Number(value).toFixed(4)}`;
const number = (value: number | null) => value === null ? "—" : Number(value).toLocaleString("ko-KR");
const statuses: Record<string, string> = { queued: "접수", running: "진행 중", completed: "완료",
  needs_input: "확인 필요", failed: "실패", cancelled: "취소" };

export async function PrayerApiUsage() {
  let report: UsageReport | null = null;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("get_prayer_api_usage");
    if (!error) report = data as UsageReport;
  } catch { /* Accounting availability must not block public prayer content. */ }
  return <PrayerApiUsageView report={report} />;
}

export function PrayerApiUsageView({ report }: { report: UsageReport | null }) {
  return <details className="prayer-api-usage">
    <summary>API 사용량 · 최근 30일</summary>
    {!report ? <p role="status">사용량을 불러오지 못했습니다. 사용량 DB 설정을 확인해주세요.</p> : <>
      <div className="prayer-usage-totals"><strong>수집된 예상 비용 {money(report.estimated_usd)}</strong>
        <span>API 응답 {number(report.calls)}건</span><span>미수집 요청 {number(report.untracked_requests)}건</span>
        <span>단가·사용량 미확인 {number(report.unpriced_calls)}건</span></div>
      <p>USD 추정치 · 크레딧 차감 전 · 실제 청구액과 다를 수 있음 · 미수집·취소·통신 오류 비용은 포함되지 않을 수 있음</p>
      {report.rows.length ? <div className="prayer-usage-scroll" tabIndex={0} aria-label="기도회 요청별 API 사용량">
        <table><thead><tr><th>기도회 / 요청</th><th>상태</th><th>예상 비용</th><th>호출 / 이미지 검증</th><th>입력 / 캐시 / 출력 토큰</th><th>검색</th></tr></thead>
          <tbody>{report.rows.map((row) => <tr key={row.id}>
            <td>{row.event_date}<small title={row.id}>{row.id.slice(0, 8)}</small></td>
            <td>{statuses[row.status] ?? row.status}</td><td>{money(row.estimated_usd)}{row.unpriced_calls > 0 ? " + 미확인" : ""}</td>
            <td>{number(row.calls)} / {number(row.vision_calls)}</td>
            <td>{number(row.input_tokens)} / {number(row.cached_tokens)} / {number(row.output_tokens)}</td>
            <td>{number(row.search_calls)}</td>
          </tr>)}</tbody></table></div> : <p>최근 생성 요청이 없습니다.</p>}
      <small>최근 요청 최대 100건 · 합계는 최근 30일 전체 요청 기준 · 새로고침 시 갱신</small>
    </>}
  </details>;
}
