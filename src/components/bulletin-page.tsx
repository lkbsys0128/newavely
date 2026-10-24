"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Upload, X, Newspaper, Plus, Pencil, ChevronDown } from "lucide-react";
import { publishBulletin } from "@/app/bulletin/actions";
import { bulletinMaxBytes, type Bulletin } from "@/lib/bulletin";
import { formatPrayerDate } from "@/lib/prayer-meetings";
import { BulletinShare } from "@/components/prayer-share";

export function BulletinPage({ bulletin, imageUrl, canEdit, error, today, history = [], latestDate = bulletin?.event_date ?? "" }: {
  bulletin: Bulletin | null; imageUrl: string; canEdit: boolean; error: string; today: string;
  history?: Bulletin[]; latestDate?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <>
    <header className="bulletin-heading"><div><p className="eyebrow">뉴웨이브 공동체</p><h1><Newspaper size={28} />주보</h1></div>
      <div className="bulletin-actions">{imageUrl ? <a className="secondary-button" href={imageUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />원본 보기</a> : null}
        {bulletin && imageUrl && bulletin.event_date === latestDate ? <BulletinShare eventDate={bulletin.event_date} /> : null}
        {canEdit && bulletin ? <button type="button" className="secondary-button" disabled={pending} onClick={() => { setEditing(true); setReplacing(true); setFile(null); setMessage(""); }}><Pencil size={16} />이 주보 수정</button> : null}
        {canEdit ? <button type="button" className="primary-button" disabled={pending} onClick={() => { setEditing(true); setReplacing(false); setFile(null); setMessage(""); }}><Plus size={16} />새 주보</button> : null}</div>
    </header>
    {canEdit && history.length > 0 ? <details className="bulletin-history" open>
      <summary><span>저장된 주보 <span className="bulletin-count">{history.length}</span></span><ChevronDown size={18} /></summary>
      <ul>{history.map((item) => <li key={item.event_date}><Link href={`/bulletin?date=${item.event_date}`} aria-current={item.event_date === bulletin?.event_date ? "page" : undefined}>
        <time dateTime={item.event_date}>{item.event_date}</time><span className="bulletin-history-title">{item.title}</span>{item.event_date === latestDate ? <span className="bulletin-status">최신 · 공개</span> : null}
      </Link></li>)}</ul>
    </details> : null}
    {error || message ? <p className="prayer-message" role="status">{error || message}</p> : null}
    {canEdit && editing ? <form key={replacing ? bulletin?.event_date : "new"} className="management-form bulletin-upload" ref={formRef} onSubmit={(event) => {
      event.preventDefault();
      if (!file) { setMessage("주보 이미지를 선택해주세요."); return; }
      const data = new FormData(event.currentTarget);
      data.set("image", file);
      data.set("version", String(replacing ? bulletin?.version ?? 0 : 0));
      startTransition(async () => {
        const result = await publishBulletin(data);
        setMessage(result.message);
        if (result.ok) { setEditing(false); setFile(null); formRef.current?.reset(); router.push(`/bulletin?date=${data.get("date")}`); router.refresh(); }
      });
    }}>
      <h2>{replacing ? "주보 수정" : "새 주보 저장"}</h2>
      <div className="bulletin-upload-fields"><label>주보 제목<input name="title" defaultValue={replacing ? bulletin?.title : "뉴웨이브 주일 주보"} required maxLength={120} disabled={pending} /></label>
        <label>주보 날짜<input type="date" name="date" defaultValue={replacing ? bulletin?.event_date : today} readOnly={replacing} required disabled={pending} /></label></div>
      <label><span className="bulletin-file-label">주보 이미지 <span>JPEG / PNG · 최대 3MB</span></span><input type="file" name="image" accept="image/jpeg,image/png" required disabled={pending} onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        if (selected && (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size > bulletinMaxBytes)) {
          setMessage("3MB 이하의 JPEG 또는 PNG 파일을 선택해주세요."); setFile(null); event.target.value = ""; return;
        }
        setMessage(""); setFile(selected);
      }} /></label>
      <p className="meta">게시한 주보는 로그인 없이 누구나 볼 수 있습니다. 공개 가능한 이미지만 올려주세요.</p>
      {preview ? <img className="bulletin-upload-preview" src={preview} alt="게시할 주보 미리보기" /> : null}
      <div className="bulletin-actions"><button type="button" className="secondary-button" disabled={pending} onClick={() => { setEditing(false); setFile(null); }}><X size={16} />취소</button>
        <button type="submit" className="primary-button" disabled={pending || !file}><Upload size={16} />{pending ? "저장 중..." : "주보 저장"}</button></div>
    </form> : null}
    {bulletin && imageUrl ? <article className="bulletin-document"><div className="bulletin-caption"><h2>{bulletin.title}</h2><time dateTime={bulletin.event_date}>{formatPrayerDate(bulletin.event_date)}</time></div>
      <a href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label="주보 원본 크게 보기"><img src={imageUrl} alt={`${bulletin.event_date} ${bulletin.title}`} className="bulletin-image" /></a>
    </article> : !error ? <section className="prayer-empty"><Newspaper size={32} /><h2>아직 등록된 주보가 없습니다</h2></section> : null}
  </>;
}
