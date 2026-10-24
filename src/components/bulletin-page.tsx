"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Upload, X, Newspaper } from "lucide-react";
import { publishBulletin } from "@/app/bulletin/actions";
import { bulletinMaxBytes, type Bulletin } from "@/lib/bulletin";
import { formatPrayerDate } from "@/lib/prayer-meetings";

export function BulletinPage({ bulletin, imageUrl, canEdit, error, today }: {
  bulletin: Bulletin | null; imageUrl: string; canEdit: boolean; error: string; today: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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
        {canEdit ? <button type="button" className="primary-button" disabled={pending} onClick={() => { setEditing(!editing); setMessage(""); }}><Upload size={16} />{bulletin ? "주보 교체" : "주보 올리기"}</button> : null}</div>
    </header>
    {error || message ? <p className="prayer-message" role="status">{error || message}</p> : null}
    {canEdit && editing ? <form className="management-form bulletin-upload" ref={formRef} onSubmit={(event) => {
      event.preventDefault();
      if (!file) { setMessage("주보 이미지를 선택해주세요."); return; }
      const data = new FormData(event.currentTarget);
      data.set("image", file);
      data.set("version", String(bulletin?.version ?? 0));
      startTransition(async () => {
        const result = await publishBulletin(data);
        setMessage(result.message);
        if (result.ok) { setEditing(false); setFile(null); formRef.current?.reset(); router.refresh(); }
      });
    }}>
      <div className="bulletin-upload-fields"><label>주보 제목<input name="title" defaultValue="뉴웨이브 주일 주보" required maxLength={120} disabled={pending} /></label>
        <label>주보 날짜<input type="date" name="date" defaultValue={today} required disabled={pending} /></label></div>
      <label>주보 이미지 · JPEG / PNG · 최대 3MB<input type="file" name="image" accept="image/jpeg,image/png" required disabled={pending} onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        if (selected && (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size > bulletinMaxBytes)) {
          setMessage("3MB 이하의 JPEG 또는 PNG 파일을 선택해주세요."); setFile(null); event.target.value = ""; return;
        }
        setMessage(""); setFile(selected);
      }} /></label>
      <p className="meta">게시한 주보는 로그인 없이 누구나 볼 수 있습니다. 공개 가능한 이미지만 올려주세요.</p>
      {preview ? <img className="bulletin-upload-preview" src={preview} alt="게시할 주보 미리보기" /> : null}
      <div className="bulletin-actions"><button type="button" className="secondary-button" disabled={pending} onClick={() => { setEditing(false); setFile(null); }}><X size={16} />취소</button>
        <button type="submit" className="primary-button" disabled={pending || !file}><Upload size={16} />{pending ? "게시 중..." : "주보 게시"}</button></div>
    </form> : null}
    {bulletin && imageUrl ? <article className="bulletin-document"><div className="bulletin-caption"><h2>{bulletin.title}</h2><time dateTime={bulletin.event_date}>{formatPrayerDate(bulletin.event_date)}</time></div>
      <a href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label="주보 원본 크게 보기"><img src={imageUrl} alt={`${bulletin.event_date} ${bulletin.title}`} className="bulletin-image" /></a>
    </article> : !error ? <section className="prayer-empty"><Newspaper size={32} /><h2>아직 등록된 주보가 없습니다</h2></section> : null}
  </>;
}
