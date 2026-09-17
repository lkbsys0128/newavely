"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Pencil, Save, X, ChevronLeft, ChevronRight } from "lucide-react";
import { savePrayerMeeting } from "@/app/prayer/actions";
import { formatPrayerDate, type PrayerMeeting, type PrayerSummary } from "@/lib/prayer-meetings";

type Props = { meeting: PrayerMeeting | null; history: PrayerSummary[]; canEdit: boolean; creating: boolean; today: string; page: number; count: number; error: string };

export function PrayerMeetingPage({ meeting, history, canEdit, creating, today, page, count, error }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(creating && canEdit);
  const [date, setDate] = useState(meeting?.event_date ?? today);
  const [entries, setEntries] = useState(() => (meeting?.entries ?? [{ title: "오프닝 기도", detail: "" }, { title: "찬양", detail: "" }, { title: "마무리 기도", detail: "" }])
    .map((entry, index) => ({ ...entry, key: `row-${index}` })));
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (editing && dirty) event.preventDefault(); };
    const warnNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (editing && dirty && anchor && !window.confirm("저장하지 않은 변경사항이 있습니다. 이동할까요?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnNavigation, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", warnNavigation, true); };
  }, [editing, dirty]);
  function move(index: number, direction: number) {
    setEntries((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
    setDirty(true);
  }
  function cancel() {
    if (dirty && !window.confirm("저장하지 않은 변경사항을 취소할까요?")) return;
    setDirty(false);
    if (creating) router.push("/prayer");
    else {
      setEntries((meeting?.entries ?? []).map((entry, index) => ({ ...entry, key: `row-${index}` })));
      setDate(meeting?.event_date ?? today);
      setEditing(false);
      setMessage("");
    }
  }
  return <>
    <header className="prayer-heading">
      <div className="prayer-brand"><Image src="/newave-icon.png" width={36} height={46} alt="뉴웨이브" /><div><p className="eyebrow">함께 기도</p><h1>오늘의 기도회</h1></div></div>
      <div className="prayer-commands">
        {canEdit && !editing ? <><Link className="secondary-button" href="/prayer?new=1"><Plus size={16} />새 기도회</Link>
          {meeting ? <button className="primary-button" onClick={() => setEditing(true)}><Pencil size={16} />순서 수정</button> : null}</> : null}
        {!canEdit ? <Link className="secondary-button" href="/">로그인</Link> : null}
      </div>
    </header>
    {error ? <p className="prayer-message" role="alert">{error}</p> : null}
    {editing ? <form className="management-form prayer-editor" onSubmit={(event) => {
      event.preventDefault(); setMessage("");
      startTransition(async () => {
        const result = await savePrayerMeeting({ id: meeting?.id ?? null, version: meeting?.version ?? 0, eventDate: date, entries: entries.map(({ title, detail }) => ({ title, detail })) });
        if (!result.ok) { setMessage(result.message); return; }
        setDirty(false); setEditing(false); router.push(`/prayer?id=${result.id}`); router.refresh();
      });
    }}>
      <div className="prayer-editor-top"><label>기도회 날짜<input type="date" required value={date} disabled={pending} onChange={(event) => { setDate(event.target.value); setDirty(true); }} /></label>
        <p className="meta">저장한 날짜 중 가장 최신 기도회는 누구나 볼 수 있습니다. 개인 연락처나 민감한 기도 제목은 입력하지 마세요.</p></div>
      <div className="prayer-editor-head" aria-hidden="true"><span>순서</span><span>항목</span><span>찬양 제목 · 내용</span><span>정렬</span></div>
      <div className="prayer-edit-rows">{entries.map((entry, index) => <div className="prayer-edit-row" key={entry.key}>
        <span className="prayer-number">{String(index + 1).padStart(2, "0")}</span>
        <label><span className="prayer-mobile-label">항목</span><input autoFocus={entry.key.startsWith("new-")} aria-label={`${index + 1}번 항목`} value={entry.title} maxLength={120} required disabled={pending}
          onChange={(event) => { setEntries(entries.map((item) => item.key === entry.key ? { ...item, title: event.target.value } : item)); setDirty(true); }} /></label>
        <label><span className="prayer-mobile-label">찬양 제목 · 내용</span><textarea aria-label={`${index + 1}번 내용`} rows={2} value={entry.detail} maxLength={500} disabled={pending}
          onChange={(event) => { setEntries(entries.map((item) => item.key === entry.key ? { ...item, detail: event.target.value } : item)); setDirty(true); }} /></label>
        <div className="prayer-row-tools">
          <button className="prayer-icon-button" type="button" title="위로 이동" aria-label={`${index + 1}번 위로 이동`} disabled={pending || index === 0} onClick={() => move(index, -1)}><ArrowUp size={17} /></button>
          <button className="prayer-icon-button" type="button" title="아래로 이동" aria-label={`${index + 1}번 아래로 이동`} disabled={pending || index === entries.length - 1} onClick={() => move(index, 1)}><ArrowDown size={17} /></button>
          <button className="prayer-icon-button" type="button" title="행 삭제" aria-label={`${index + 1}번 행 삭제`} disabled={pending || entries.length === 1} onClick={() => { setEntries(entries.filter((item) => item.key !== entry.key)); setDirty(true); }}><Trash2 size={17} /></button>
        </div>
      </div>)}</div>
      <button className="secondary-button prayer-add-row" type="button" disabled={pending || entries.length >= 100} onClick={() => { setEntries([...entries, { key: `new-${crypto.randomUUID()}`, title: "", detail: "" }]); setDirty(true); }}><Plus size={17} />행 추가</button>
      {message ? <p className="prayer-message" role="alert">{message}</p> : null}
      <div className="prayer-save-bar"><button className="secondary-button" type="button" disabled={pending} onClick={cancel}><X size={16} />취소</button>
        <button className="primary-button" disabled={pending} type="submit"><Save size={16} />{pending ? "저장 중" : "저장 · 공개"}</button></div>
    </form> : meeting ? <article className="prayer-program">
      <div className="prayer-program-date"><p className="eyebrow">기도회 순서</p><h2><time dateTime={meeting.event_date}>{formatPrayerDate(meeting.event_date)}</time></h2></div>
      <ol className="prayer-order">{meeting.entries.map((entry, index) => <li key={index}><span className="prayer-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h3>{entry.title}</h3>{entry.detail ? <p>{entry.detail}</p> : null}</div></li>)}</ol>
    </article> : !error ? <div className="prayer-empty"><h2>아직 등록된 기도회가 없습니다</h2>{canEdit ? <Link className="primary-button" href="/prayer?new=1"><Plus size={16} />첫 기도회 만들기</Link> : null}</div> : null}
    {canEdit && !editing ? <section className="prayer-history" aria-labelledby="prayer-history-title"><div className="prayer-history-heading"><h2 id="prayer-history-title">지난 기도회</h2><span className="meta">{count}건 · 생성 최신순</span></div>
      {history.length ? <ul>{history.map((item) => <li key={item.id}><Link href={`/prayer?id=${item.id}&page=${page}`} aria-current={meeting?.id === item.id ? "page" : undefined}>
        <span>{formatPrayerDate(item.event_date)}</span><span className="meta">등록 {new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at))}</span><ChevronRight size={17} /></Link></li>)}</ul> : <p className="meta">등록된 기록이 없습니다.</p>}
      <nav className="prayer-pagination" aria-label="기도회 목록 페이지">{page > 1 ? <Link className="secondary-button" href={`/prayer?page=${page - 1}`}><ChevronLeft size={16} />이전</Link> : null}<span>{page} / {Math.max(1, Math.ceil(count / 20))}</span>{page * 20 < count ? <Link className="secondary-button" href={`/prayer?page=${page + 1}`}>다음<ChevronRight size={16} /></Link> : null}</nav>
    </section> : null}
  </>;
}
