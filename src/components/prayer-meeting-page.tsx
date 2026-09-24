"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Save, X, ChevronLeft, ChevronRight, ExternalLink, CalendarDays, Music2, BookOpen, HeartHandshake } from "lucide-react";
import { PrayerShare } from "@/components/prayer-share";
import { safeSourceUrl } from "@/lib/prayer-source-search";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PrayerEditRow } from "@/components/prayer-edit-row";
import { toPrayerEditEntry } from "@/lib/prayer-editor";
import { savePrayerMeeting } from "@/app/prayer/actions";
import { formatPrayerDate, type PrayerMeeting, type PrayerSummary } from "@/lib/prayer-meetings";

type Props = { meeting: PrayerMeeting | null; history: PrayerSummary[]; canEdit: boolean; creating: boolean; today: string; page: number; count: number; error: string };

export function PrayerMeetingPage({ meeting, history, canEdit, creating, today, page, count, error }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(creating && canEdit);
  const [date, setDate] = useState(meeting?.event_date ?? today);
  const [entries, setEntries] = useState(() => (meeting?.entries ?? [{ title: "기도", detail: "" }, { title: "찬양", detail: "" }, { title: "묵상/나눔", detail: "" }])
    .map((entry, index) => toPrayerEditEntry(entry, `row-${index}`)));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
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
  function cancel() {
    if (dirty && !window.confirm("저장하지 않은 변경사항을 취소할까요?")) return;
    setDirty(false);
    if (creating) router.push("/prayer");
    else {
      setEntries((meeting?.entries ?? []).map((entry, index) => toPrayerEditEntry(entry, `row-${index}`)));
      setDate(meeting?.event_date ?? today);
      setEditing(false);
      setMessage("");
    }
  }
  return <>
    <header className="prayer-heading">
      <div className="prayer-brand"><Image className="seasonal-logo" src="/newave-icon.png" width={36} height={46} alt="뉴웨이브" /><h1>오늘의 기도회</h1></div>
      <div className="prayer-commands">
        {meeting && !editing && !error ? <PrayerShare key={meeting.id} meetingId={meeting.id} eventDate={meeting.event_date} /> : null}
        {canEdit && !editing ? <><Link className="secondary-button" href="/prayer?new=1"><Plus size={16} />새 기도회</Link>
          {meeting ? <button className="primary-button" onClick={() => setEditing(true)}><Pencil size={16} />순서 수정</button> : null}</> : null}
        {!canEdit ? <Link className="secondary-button" href="/">로그인</Link> : null}
      </div>
    </header>
    {error ? <p className="prayer-message" role="alert">{error}</p> : null}
    {editing ? <form className="management-form prayer-editor" onSubmit={(event) => {
      event.preventDefault(); setMessage("");
      startTransition(async () => {
        const result = await savePrayerMeeting({ id: meeting?.id ?? null, version: meeting?.version ?? 0, eventDate: date, entries: entries.map(({ title, detail, sourceUrl }) => ({ title, detail, ...(sourceUrl ? { sourceUrl } : {}) })) });
        if (!result.ok) { setMessage(result.message); return; }
        setDirty(false); setEditing(false); router.push(`/prayer?id=${result.id}`); router.refresh();
      });
    }}>
      <div className="prayer-editor-top"><label>기도회 날짜<input type="date" required value={date} disabled={pending} onChange={(event) => { setDate(event.target.value); setDirty(true); }} /></label>
        <p className="meta">저장한 날짜 중 가장 최신 기도회는 누구나 볼 수 있습니다. 개인 연락처나 민감한 기도 제목은 입력하지 마세요.</p></div>
      <div className="prayer-editor-head" aria-hidden="true"><span>순서</span><span>항목</span><span>찬양 제목 · 내용</span><span>삭제</span></div>
      <DndContext id="prayer-order-editor" sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (pending || !over || active.id === over.id) return;
        setEntries((current) => {
          const from = current.findIndex((entry) => entry.key === active.id);
          const to = current.findIndex((entry) => entry.key === over.id);
          return from < 0 || to < 0 ? current : arrayMove(current, from, to);
        });
        setDirty(true);
      }} accessibility={{ screenReaderInstructions: { draggable: "스페이스 키로 순서를 잡고 위아래 방향키로 이동하세요. 스페이스 키로 놓거나 Escape 키로 취소할 수 있습니다." } }}>
        <SortableContext items={entries.map((entry) => entry.key)} strategy={verticalListSortingStrategy}>
          <div className="prayer-edit-rows">{entries.map((entry, index) => <PrayerEditRow key={entry.key} entry={entry} index={index} pending={pending} onlyRow={entries.length === 1}
            onChange={(changed) => { setEntries((current) => current.map((item) => item.key === changed.key ? changed : item)); setDirty(true); }}
            onDelete={() => { setEntries((current) => current.filter((item) => item.key !== entry.key)); setDirty(true); }} />)}</div>
        </SortableContext>
      </DndContext>
      <button className="secondary-button prayer-add-row" type="button" disabled={pending || entries.length >= 100} onClick={() => { setEntries([...entries, toPrayerEditEntry({ title: "기도", detail: "" }, `new-${crypto.randomUUID()}`)]); setDirty(true); }}><Plus size={17} />행 추가</button>
      {message ? <p className="prayer-message" role="alert">{message}</p> : null}
      <div className="prayer-save-bar"><button className="secondary-button" type="button" disabled={pending} onClick={cancel}><X size={16} />취소</button>
        <button className="primary-button" disabled={pending} type="submit"><Save size={16} />{pending ? "저장 중" : "저장 · 공개"}</button></div>
    </form> : meeting ? <article className="prayer-program">
      <div className="prayer-program-date"><div><p className="eyebrow">뉴웨이브 공동체 · 기도회 순서</p><h2><time dateTime={meeting.event_date}>{formatPrayerDate(meeting.event_date)}</time></h2><span className="prayer-program-count"><CalendarDays size={15} aria-hidden="true" />총 {meeting.entries.length}개 순서</span></div><Image className="prayer-program-mark seasonal-logo" src="/newave-icon.png" width={44} height={56} alt="" /></div>
      <div className="prayer-order-heading" aria-hidden="true"><span>순서</span><span>항목</span><span>찬양 · 말씀 · 기도</span></div>
      <ol className="prayer-order">{meeting.entries.map((entry, index) => {
        const EntryIcon = entry.title.includes("찬양") ? Music2 : /묵상|나눔|큐티/.test(entry.title) ? BookOpen : HeartHandshake;
        return <li key={index}><span className="prayer-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="prayer-entry-kind"><EntryIcon size={17} aria-hidden="true" /><h3>{entry.title}</h3></div><div className="prayer-entry-detail">{entry.detail ? <p>{entry.detail}</p> : <span className="prayer-entry-rule" aria-hidden="true" />}
        {entry.sourceUrl && safeSourceUrl(entry.sourceUrl) ? <a className="prayer-source-link" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />가사 원문</a> : null}
      </div></li>;})}</ol>
    </article> : !error ? <div className="prayer-empty"><h2>아직 등록된 기도회가 없습니다</h2>{canEdit ? <Link className="primary-button" href="/prayer?new=1"><Plus size={16} />첫 기도회 만들기</Link> : null}</div> : null}
    {canEdit && !editing ? <section className="prayer-history" aria-labelledby="prayer-history-title"><div className="prayer-history-heading"><h2 id="prayer-history-title">지난 기도회</h2><span className="meta">{count}건 · 생성 최신순</span></div>
      {history.length ? <ul>{history.map((item) => <li key={item.id}><Link href={`/prayer?id=${item.id}&page=${page}`} aria-current={meeting?.id === item.id ? "page" : undefined}>
        <span>{formatPrayerDate(item.event_date)}</span><span className="meta">등록 {new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at))}</span><ChevronRight size={17} /></Link></li>)}</ul> : <p className="meta">등록된 기록이 없습니다.</p>}
      <nav className="prayer-pagination" aria-label="기도회 목록 페이지">{page > 1 ? <Link className="secondary-button" href={`/prayer?page=${page - 1}`}><ChevronLeft size={16} />이전</Link> : null}<span>{page} / {Math.max(1, Math.ceil(count / 20))}</span>{page * 20 < count ? <Link className="secondary-button" href={`/prayer?page=${page + 1}`}>다음<ChevronRight size={16} /></Link> : null}</nav>
    </section> : null}
  </>;
}
