"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Sparkles, Save, X, ChevronLeft, ChevronRight, CalendarDays, Music2, BookOpen, HeartHandshake } from "lucide-react";
import { PrayerShare } from "@/components/prayer-share";
import { PrayerEntryLinks } from "@/components/prayer-entry-links";
import { PrayerTemplateControls } from "@/components/prayer-template-controls";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PrayerEditRow } from "@/components/prayer-edit-row";
import { toPrayerEditEntry } from "@/lib/prayer-editor";
import { createPrayerGenerationDraft } from "@/lib/prayer-generation-draft";
import { savePrayerMeeting } from "@/app/prayer/actions";
import { formatPrayerDate, serializePrayerEntry, type PrayerMeeting, type PrayerSummary } from "@/lib/prayer-meetings";

const PrayerGenerationPanel = dynamic(() => import("@/components/prayer-generation-panel").then((module) => module.PrayerGenerationPanel));

type Props = { meeting: PrayerMeeting | null; history: PrayerSummary[]; canEdit: boolean; creating: boolean; today: string; page: number; count: number; error: string; generationEnabled?: boolean; editingRequested?: boolean };

export function PrayerMeetingPage({ meeting, history, canEdit, creating, today, page, count, error, generationEnabled = false, editingRequested = false }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(canEdit && (creating || (editingRequested && Boolean(meeting))));
  const [generationDraft, setGenerationDraft] = useState(false);
  const [draftIssues, setDraftIssues] = useState<string[]>([]);
  const [creationMode, setCreationMode] = useState<"ai" | "manual">(generationEnabled ? "ai" : "manual");
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
    setGenerationDraft(false);
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
      <div className="prayer-brand"><Image className="seasonal-logo" src="/newave-icon.png" width={36} height={46} alt="뉴웨이브" /><h1>{creating ? "새 기도회" : editing ? "기도회 수정" : "오늘의 기도회"}</h1></div>
      <div className="prayer-commands">
        {meeting && !editing && !error ? <PrayerShare key={meeting.id} meetingId={meeting.id} eventDate={meeting.event_date} /> : null}
        {canEdit && !editing ? <>
          <Link className="secondary-button" href="/prayer?new=1"><Plus size={16} />새 기도회</Link>
          {meeting ? <Link className="primary-button" href={`/prayer?id=${encodeURIComponent(meeting.id)}&edit=1`}><Pencil size={16} />순서 수정</Link> : null}</> : null}
        {!canEdit ? <Link className="secondary-button" href="/">로그인</Link> : null}
        {canEdit && creating ? <button type="button" className="secondary-button" onClick={cancel} disabled={pending}><X size={16} />닫기</button> : null}
      </div>
    </header>
    {error ? <p className="prayer-message" role="alert">{error}</p> : null}
    {canEdit && creating ? <div className="prayer-creation-modes" role="group" aria-label="기도회 생성 방식">
      <button type="button" aria-pressed={creationMode === "ai"} disabled={pending} onClick={() => setCreationMode("ai")}><Sparkles size={17} />AI로 생성</button>
      <button type="button" aria-pressed={creationMode === "manual"} disabled={pending} onClick={() => setCreationMode("manual")}><Pencil size={17} />직접 작성</button>
    </div> : null}
    {canEdit && creating ? <PrayerGenerationPanel today={today} generationEnabled={generationEnabled} open={creationMode === "ai"} onEditDraft={(input) => {
      if (dirty && !window.confirm("작성 중인 내용을 AI 초안으로 바꿀까요?")) return;
      const draft = createPrayerGenerationDraft({ eventDate: input.eventDate, beforeSongs: input.beforeSongs, afterSongs: input.afterSongs }, input.savedDraft);
      setDraftIssues(input.savedDraft?.issues.map((issue) => issue.message) ?? []);
      setDate(draft.eventDate);
      setEntries(draft.entries.map((entry, index) => toPrayerEditEntry(entry, `generated-draft-${index}`)));
      setGenerationDraft(true); setCreationMode("manual"); setEditing(true); setDirty(true);
      setMessage("아직 저장되지 않은 초안입니다. 가사·악보 링크와 말씀을 확인해 보완한 뒤 저장해주세요. 같은 날짜의 기존 기도회는 덮어쓰지 않습니다.");
    }} /> : null}
    {editing && (!creating || creationMode === "manual") ? <form className="management-form prayer-editor" onSubmit={(event) => {
      event.preventDefault(); setMessage("");
      startTransition(async () => {
        const result = await savePrayerMeeting({ id: generationDraft ? null : meeting?.id ?? null, version: generationDraft ? 0 : meeting?.version ?? 0, eventDate: date, entries: entries.map(serializePrayerEntry) });
        if (!result.ok) { setMessage(result.message); return; }
        setDirty(false); setEditing(false); router.push(`/prayer?id=${result.id}`); router.refresh();
      });
    }}>
      <div className="prayer-editor-top"><label>기도회 날짜<input type="date" required value={date} disabled={pending} onChange={(event) => { setDate(event.target.value); setDirty(true); }} /></label>
        <p className="meta">저장한 날짜 중 가장 최신 기도회는 누구나 볼 수 있습니다. 개인 연락처나 민감한 기도 제목은 입력하지 마세요.</p></div>
      {generationDraft && draftIssues.length ? <div role="status"><strong>초안에서 보완이 필요한 항목</strong><ul>{draftIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
      <PrayerTemplateControls entries={entries} disabled={pending} dirty={dirty} onLoad={(loaded) => {
        setEntries(loaded.map((entry) => toPrayerEditEntry(entry, `template-${crypto.randomUUID()}`))); setDirty(true);
      }} />
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
    </form> : !creating && meeting ? <article className="prayer-program">
      <div className="prayer-program-date"><div><p className="eyebrow">뉴웨이브 공동체 · 기도회 순서</p><h2><time dateTime={meeting.event_date}>{formatPrayerDate(meeting.event_date)}</time></h2><span className="prayer-program-count"><CalendarDays size={15} aria-hidden="true" />총 {meeting.entries.length}개 순서</span></div><Image className="prayer-program-mark seasonal-logo" src="/newave-icon.png" width={44} height={56} alt="" /></div>
      <div className="prayer-order-heading" aria-hidden="true"><span>순서</span><span>항목</span><span>찬양 · 말씀 · 기도</span></div>
      <ol className="prayer-order">{meeting.entries.map((entry, index) => {
        const EntryIcon = entry.title.includes("찬양") ? Music2 : /묵상|나눔|큐티/.test(entry.title) ? BookOpen : HeartHandshake;
        return <li key={index}><span className="prayer-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="prayer-entry-kind"><EntryIcon size={17} aria-hidden="true" /><h3>{entry.title}</h3></div><div className="prayer-entry-detail">{entry.detail ? <p>{entry.detail}</p> : <span className="prayer-entry-rule" aria-hidden="true" />}
        <PrayerEntryLinks entry={entry} />
      </div></li>;})}</ol>
    </article> : !creating && !error ? <div className="prayer-empty"><h2>아직 등록된 기도회가 없습니다</h2>{canEdit ? <Link className="primary-button" href="/prayer?new=1"><Plus size={16} />첫 기도회 만들기</Link> : null}</div> : null}
    {canEdit && !editing ? <section className="prayer-history" aria-labelledby="prayer-history-title"><div className="prayer-history-heading"><h2 id="prayer-history-title">지난 기도회</h2><span className="meta">{count}건 · 생성 최신순</span></div>
      {history.length ? <ul>{history.map((item) => <li key={item.id}><Link href={`/prayer?id=${item.id}&page=${page}`} aria-current={meeting?.id === item.id ? "page" : undefined}>
        <span>{formatPrayerDate(item.event_date)}</span><span className="meta">등록 {new Intl.DateTimeFormat("ko-KR", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at))}</span><ChevronRight size={17} /></Link></li>)}</ul> : <p className="meta">등록된 기록이 없습니다.</p>}
      <nav className="prayer-pagination" aria-label="기도회 목록 페이지">{page > 1 ? <Link className="secondary-button" href={`/prayer?page=${page - 1}`}><ChevronLeft size={16} />이전</Link> : null}<span>{page} / {Math.max(1, Math.ceil(count / 20))}</span>{page * 20 < count ? <Link className="secondary-button" href={`/prayer?page=${page + 1}`}>다음<ChevronRight size={16} /></Link> : null}</nav>
    </section> : null}
  </>;
}
