"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, LoaderCircle, Music2, Pencil, Plus, Trash2, RefreshCw, X } from "lucide-react";
import { cancelPrayerGeneration, getPrayerGenerationJob, listOwnPrayerGenerationJobs, startPrayerGeneration } from "@/app/prayer/generation-actions";
import { maxPrayerSongs, type GenerationJob } from "@/lib/prayer-generation";

type Draft = { eventDate: string; beforeSongs: string[]; afterSongs: string[] };
type Submission = Draft & { requestId: string };
type Notice = { message: string; error?: boolean };
const serverActions = { cancelPrayerGeneration, getPrayerGenerationJob, listOwnPrayerGenerationJobs, startPrayerGeneration };
type Props = { today: string; generationEnabled: boolean; open: boolean; onClose?: () => void; onEditDraft?: (draft: Draft) => void; actions?: typeof serverActions };

const statusLabels: Record<GenerationJob["status"], string> = {
  queued: "접수됨", running: "자료 확인 중", needs_input: "확인 필요", completed: "저장 완료", failed: "생성 실패", cancelled: "취소됨",
};
const activeJob = (job: GenerationJob | null) => job?.status === "queued" || job?.status === "running";
const emptyDraft = (today: string): Draft => ({ eventDate: today, beforeSongs: ["", ""], afterSongs: ["", ""] });
const jobDraft = (job: GenerationJob): Draft => ({ eventDate: job.eventDate,
  beforeSongs: [...job.beforeSongs], afterSongs: [...job.afterSongs] });

function newestJob(previous: GenerationJob | undefined, next: GenerationJob) {
  if (previous && (Date.parse(previous.updatedAt) > Date.parse(next.updatedAt) || (!activeJob(previous) && activeJob(next)))) return previous;
  return next;
}

export function PrayerGenerationPanel({ today, generationEnabled, open, onClose, onEditDraft, actions = serverActions }: Props) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pollNotice, setPollNotice] = useState("");
  const [loading, setLoading] = useState(open && generationEnabled);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const selectedId = useRef<string | null>(null);
  const submission = useRef<Submission | null>(null);
  const mutationPending = useRef(false);
  const draftTouched = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const requestTail = useRef<Promise<unknown>>(Promise.resolve());
  const busy = pending || loading;
  const saved = job?.status === "completed" && Boolean(job.meetingId);
  const fieldsDisabled = busy || !generationEnabled || Boolean(job) || uncertain;
  const shown = job ? jobDraft(job) : draft;

  // All action calls are serialized, including polling and manual refreshes.
  const request = useCallback(function runRequest<T>(work: () => Promise<T>): Promise<T> {
    const next = requestTail.current.then(work, work);
    requestTail.current = next.catch(() => undefined);
    return next;
  }, []);

  const acceptJob = useCallback((next: GenerationJob, select = false) => {
    if (!mounted.current) return;
    setJobs((current) => [...current.filter((item) => item.id !== next.id), newestJob(current.find((item) => item.id === next.id), next)]
      .sort((a, b) => Number(activeJob(b)) - Number(activeJob(a)) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5));
    if (select || selectedId.current === next.id) {
      selectedId.current = next.id;
      setJob((current) => newestJob(current?.id === next.id ? current : undefined, next));
      if (!activeJob(next)) setPollNotice("");
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    if (mutationPending.current) return;
    setLoading(true);
    try {
      const result = await request(actions.listOwnPrayerGenerationJobs);
      if (!mounted.current) return;
      if (!result.ok) { setNotice({ message: result.message, error: true }); return; }
      const fetched = result.jobs ?? [];
      setJobs(fetched);
      const selected = fetched.find((item) => item.id === (submission.current?.requestId ?? selectedId.current));
      const resume = selected ?? (!selectedId.current && !draftTouched.current ? fetched.find(activeJob) : undefined);
      if (resume) {
        acceptJob(resume, true);
        if (submission.current?.requestId === resume.id) { submission.current = null; setUncertain(false); }
      }
    } catch {
      if (mounted.current) setNotice({ message: "생성 요청을 불러오지 못했습니다. 입력한 내용은 유지됩니다.", error: true });
    } finally { if (mounted.current) setLoading(false); }
  }, [acceptJob, request, actions]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    if (generationEnabled) void refreshJobs();
  }, [open, generationEnabled, refreshJobs]);

  useEffect(() => {
    if (!open || !generationEnabled || !job || !activeJob(job)) return;
    const id = job.id;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 20 * 60_000;
    setPollNotice("");
    async function poll() {
      if (cancelled) return;
      if (Date.now() >= deadline || failures >= 5) {
        setPollNotice("자동 상태 확인을 잠시 멈췄습니다. ‘다시 확인’을 눌러주세요.");
        return;
      }
      if (document.visibilityState === "hidden" || mutationPending.current) { timer = setTimeout(poll, 15_000); return; }
      let stillRunning = true;
      try {
        const result = await request(async () => cancelled ? undefined : actions.getPrayerGenerationJob(id));
        if (cancelled || !result || selectedId.current !== id) return;
        if (result.ok && result.job) {
          failures = 0;
          acceptJob(result.job);
          setPollNotice("");
          stillRunning = activeJob(result.job);
        } else {
          failures += 1;
          setPollNotice(result.message || "진행 상태를 확인하지 못했습니다. 잠시 후 다시 확인합니다.");
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        setPollNotice("연결을 확인하지 못했습니다. 생성 요청을 새로 보내지 않고 진행 상태를 다시 확인합니다.");
      }
      if (!cancelled && stillRunning) timer = setTimeout(poll, failures ? Math.min(30_000, 5_000 * 2 ** failures) : 8_000);
    }
    timer = setTimeout(poll, pollEpoch ? 0 : 5_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, generationEnabled, job?.id, job?.status, pollEpoch, acceptJob, request, actions]);

  async function generate(retryJob?: GenerationJob) {
    if (!generationEnabled || mutationPending.current || loading) return;
    const attempt = retryJob ? { requestId: retryJob.id, ...jobDraft(retryJob) } : submission.current ?? {
      requestId: crypto.randomUUID(), eventDate: draft.eventDate,
      beforeSongs: draft.beforeSongs.map((song) => song.trim()),
      afterSongs: draft.afterSongs.map((song) => song.trim()),
    };
    submission.current = attempt;
    mutationPending.current = true;
    setPending(true); setNotice(null);
    try {
      const result = await request(() => actions.startPrayerGeneration(attempt));
      if (!mounted.current) return;
      if (result.job) {
        acceptJob(result.job, true); submission.current = null; setUncertain(false);
      } else if (result.uncertain || result.ok) {
        setUncertain(true);
      } else {
        submission.current = null; setUncertain(false);
      }
      setNotice(result.job?.message === result.message ? null : { message: result.message, error: !result.ok });
    } catch {
      if (mounted.current) {
        setUncertain(true);
        setNotice({ message: "접수 여부를 확인하지 못했습니다. ‘같은 요청 다시 확인’을 눌러 중복 없이 이어서 확인해주세요.", error: true });
      }
    } finally { mutationPending.current = false; if (mounted.current) setPending(false); }
  }

  async function cancelJob() {
    if (!job || !activeJob(job) || mutationPending.current) return;
    mutationPending.current = true; setPending(true); setNotice(null);
    try {
      const result = await request(() => actions.cancelPrayerGeneration(job.id));
      if (!mounted.current) return;
      if (result.job) { acceptJob(result.job, true); submission.current = null; setUncertain(false); }
      setNotice(result.job?.message === result.message ? null : { message: result.message, error: !result.ok });
    } catch {
      if (mounted.current) setNotice({ message: "취소 여부를 확인하지 못했습니다. 진행 상태를 다시 확인해주세요.", error: true });
    } finally { mutationPending.current = false; if (mounted.current) setPending(false); }
  }

  function newRequest(copy?: GenerationJob) {
    selectedId.current = null; submission.current = null;
    setJob(null); setDraft(copy ? jobDraft(copy) : emptyDraft(today));
    draftTouched.current = Boolean(copy);
    setUncertain(false); setNotice(null); setPollNotice("");
  }

  return <section className="prayer-generation-panel" id="prayer-generation-panel" hidden={!open} aria-labelledby="prayer-generation-title">
    <div className="prayer-generation-heading">
      <div><h2 id="prayer-generation-title" ref={heading} tabIndex={-1}>{job ? <time dateTime={job.eventDate}>{job.eventDate}</time> : "찬양 선택"}</h2>
        </div>
      {onClose ? <button type="button" className="prayer-icon-button" aria-label="자동 생성 닫기" onClick={onClose}><X size={18} /></button> : null}
    </div>
    {!generationEnabled ? <p className="prayer-generation-notice" role="status">AI 생성 연결을 준비 중입니다. 직접 작성은 사용할 수 있습니다.</p> : null}
    {!job ? <form className="management-form prayer-generation-form" onSubmit={(event) => {
      event.preventDefault(); if (!job && !uncertain) void generate();
    }}>
      <div className="prayer-generation-date"><label>기도회 날짜<input type="date" required value={shown.eventDate} disabled={fieldsDisabled} onChange={(event) => {
        draftTouched.current = true; submission.current = null; setDraft((current) => ({ ...current, eventDate: event.target.value }));
      }} /></label></div>
      <div className="prayer-generation-song-groups">{(["beforeSongs", "afterSongs"] as const).map((group) => <fieldset key={group} disabled={fieldsDisabled}>
        <legend>{group === "beforeSongs" ? "말씀 전 찬양" : "말씀 후 찬양"}</legend>
        {shown[group].map((_, index) => <div className="prayer-generation-song-row" key={index}><label>{group === "beforeSongs" ? "앞" : "뒤"} 찬양 {index + 1}<input required maxLength={120} value={shown[group][index]}
          placeholder={group === "beforeSongs" ? (index === 0 ? "예: 목마른 사슴" : "예: 그 사랑 얼마나") : (index === 0 ? "예: 내 이름 아시죠" : "예: 주의 아름다움은 말로 다")}
          onChange={(event) => {
            draftTouched.current = true; submission.current = null;
            const value = event.target.value;
            setDraft((current) => ({ ...current, [group]: current[group].map((song, i) => i === index ? value : song) }));
          }} /></label><button type="button" className="prayer-icon-button" title="찬양 삭제" aria-label={`${group === "beforeSongs" ? "앞" : "뒤"} 찬양 ${index + 1} 삭제`} disabled={fieldsDisabled || shown.beforeSongs.length + shown.afterSongs.length <= 1} onClick={() => {
            draftTouched.current = true; submission.current = null;
            setDraft((current) => ({ ...current, [group]: current[group].filter((_, i) => i !== index) }));
          }}><Trash2 size={16} /></button></div>)}
        <button type="button" className="secondary-button" disabled={fieldsDisabled || shown.beforeSongs.length + shown.afterSongs.length >= maxPrayerSongs} onClick={() => {
          draftTouched.current = true; submission.current = null;
          setDraft((current) => ({ ...current, [group]: [...current[group], ""] }));
        }}><Plus size={16} />찬양 추가</button>
      </fieldset>)}</div>
      <p className="meta prayer-generation-hint">특정 버전을 원하면 곡명 뒤에 가수도 적어주세요. 생성이 끝나면 저장되며, 가장 최신 날짜의 기도회는 공개됩니다.</p>
      {!job ? <div className="prayer-generation-actions">
        {uncertain ? <button className="primary-button" type="button" disabled={busy || !generationEnabled} onClick={() => void generate()}><RefreshCw size={16} />{pending ? "확인 중" : "같은 요청 다시 확인"}</button>
          : <button className="primary-button" type="submit" disabled={busy || !generationEnabled}><Music2 size={16} />{pending ? "요청 접수 중" : "기도회 생성 · 공개"}</button>}
        {loading ? <span className="meta" role="status">이전 요청 확인 중...</span> : null}
      </div> : null}
    </form> : null}
    {notice?.message && (notice.error || !job || activeJob(job)) ? <p className={`prayer-generation-notice${notice.error ? " is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.message}</p> : null}
    {job ? <div className="prayer-generation-result">
      <div className="prayer-generation-status" role="status" aria-live="polite" aria-atomic="true">
        <span className={`prayer-generation-badge${job.status === "failed" || job.status === "needs_input" ? " needs-attention" : ""}`}>
          {activeJob(job) ? <span className="prayer-generation-spinner" aria-hidden="true"><LoaderCircle size={15} /></span> : null}
          {job.status === "completed" && !saved ? "저장 결과 확인 필요" : statusLabels[job.status]}</span>
        <p>{job.message}</p>
        {["failed", "needs_input"].includes(job.status) ? <p style={{ overflowWrap: "anywhere" }}>요청 ID: {job.id}</p> : null}
      </div>
      {pollNotice ? <p className="meta" role="status">{pollNotice}</p> : null}
      {saved && job.meetingId ? <div className="prayer-generation-actions"><Link className="primary-button prayer-generation-open" href={`/prayer?id=${encodeURIComponent(job.meetingId)}&edit=1`}><Pencil size={16} />순서 수정</Link><Link className="secondary-button prayer-generation-open" href={`/prayer?id=${encodeURIComponent(job.meetingId)}`}>기도회 보기<ChevronRight size={16} /></Link></div> : null}
      {saved && job.resultSummary ? <div className="prayer-generation-summary">
        {job.resultSummary.songs?.length ? <ul>{job.resultSummary.songs.map((song, index) => <li key={index}><span>{song.title}</span><span className="meta">{song.artist}</span></li>)}</ul> : null}
        {job.resultSummary.passage ? <p>{job.resultSummary.passage}{job.resultSummary.devotionalTitle ? ` · ${job.resultSummary.devotionalTitle}` : ""}</p> : null}
        {job.resultSummary.notes?.length ? <ul className="prayer-generation-notes">{job.resultSummary.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      </div> : null}
      <div className="prayer-generation-actions">
        {activeJob(job) ? <>
          {pollNotice || notice?.error ? <button className="secondary-button" type="button" disabled={busy || !generationEnabled} onClick={() => { setPollEpoch((current) => current + 1); void generate(job); }}><RefreshCw size={16} />다시 확인</button> : null}
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void cancelJob()}><X size={16} />생성 취소</button>
        </> : <>
          {onEditDraft && ["needs_input", "failed"].includes(job.status) ? <button className="primary-button" type="button" disabled={busy} onClick={() => onEditDraft(jobDraft(job))}><Pencil size={16} />직접 보완하기</button> : null}
          {!saved ? <button className="secondary-button" type="button" disabled={busy || !generationEnabled} onClick={() => newRequest(job)}>내용 수정해 다시 요청</button> : null}
          <button className="secondary-button" type="button" disabled={busy || !generationEnabled} onClick={() => newRequest()}>새 요청 작성</button>
        </>}
      </div>
    </div> : null}
    {generationEnabled && !activeJob(job) ? <details className="prayer-generation-history" onToggle={(event) => { if (event.currentTarget.open && !busy) void refreshJobs(); }}><summary>이전 생성 요청 {jobs.length ? `(${jobs.length})` : ""}</summary>
      {jobs.length ? <ul>{jobs.map((item) => <li key={item.id}><button type="button" aria-pressed={job?.id === item.id} disabled={busy || uncertain} onClick={() => {
        acceptJob(item, true); setNotice(null); setPollNotice("");
      }}><span><time dateTime={item.eventDate}>{item.eventDate}</time><span className="meta">{[...item.beforeSongs, ...item.afterSongs][0]} · {item.beforeSongs.length + item.afterSongs.length}곡</span></span>
        <span>{item.status === "completed" && !item.meetingId ? "결과 확인 필요" : statusLabels[item.status]}</span></button></li>)}</ul>
        : <p className="meta">{loading ? "이전 요청을 확인하고 있습니다." : "아직 생성 요청이 없습니다."}</p>}
    </details> : null}
  </section>;
}
